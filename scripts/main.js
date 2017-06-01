(function (global) {
    "use strict";
    /*
    STEPS:
    Draw canvas: OK
    Load sections paths and draw paths: OK
    Load and draw stations circles: OK
    Load day trips: preprocessing on python module: OK
    Load
    
    */
    
    
    // DATA PARSING FUNCTIONS
    // parse stations data
    function parseStation(d,i) {
        // returns only for given line
        if (d[global.line]){
            return {
                uic8: d.Code_UIC,
                uic7: d.UIC7,
                stop_id: d.stop_id,
                lat: +d.stop_lat,
                lon: +d.stop_lon,
                name: d.stop_name,
                linkedSections:[]
            }
        }
    }
    // parse sections data
    function parseSection(d,i) {
        // we don't keep names, they are useful for conception/debugging only
        var points= d.points.map(function(o){return Object.keys(o)[0]});
        var endPoints = [points[0],points[points.length - 1]];
        var subsections = [];
        for (var p=0; p<points.length-1;p++){
            var subsection = {
                from: points[p],
                to: points[p+1],
                distance: stationsDistance(points[p],points[p+1]),
                atTime: {
                    renderedAtTime: null,
                    observed: {
                        dir0: [],
                        dir1: []
                    },
                    scheduled: {
                        dir0: [],
                        dir1: []
                    }
                }
            };
            subsections.push(subsection);
        }
        var ro = {
            name: d.name,
            endPoints: endPoints,
            points: points,
            subsections: subsections,
            nbStations: points.length,
            pointsCoord: points.map(stationIdToCoords)
        };
        return ro;
            
    }
    // parse trips data
    function parseTrip(d,i) {
         /*parsedTrips.forEach(function (d) {
            d.stops = d.stops || [];
            var m = moment(d.begin*1000).zone(5);
            d.secs = m.diff(m.clone().startOf('day')) / 1000;
        });
        */
        // if >10000, it is an error of date parsing
        var secs = +d.end - +d.begin;
        if (secs<10000){
            var result = {
                    begin: +d.begin,
                    end: +d.end,
                    line: d.line,
                    trip: d.trip,
                    stops: d.stops.map(function(stop){
                        stop.scheduledTime = +stop.time;
                        if (stop.delay){
                            stop.delay = +stop.delay;
                            // if error of one day
                            stop.delay = stop.delay % 86400;
                            if (stop.delay>5000){
                                console.log("Info: delay>5000 secs observed: "+stop.delay);
                            }
                        }
                        stop.realStop = true;
                        return stop;
                    }),
                    secs: secs
            };
            
            /*
            for (var j=0; j<result.stops.length; j++){
                if (j===0){
                    result.stops[0].estimatedDelay = result.stops[0].delay || 0;
                    result.stops[0].estimatedTime = result.stops[0].scheduledTime + result.stops[0].estimatedDelay;
                    continue;
                }
                // estimatedDelay is this stop delay, or if not exists estimatedDelay of previous stop
                result.stops[j].estimatedDelay = result.stops[j].delay || result.stops[j-1].estimatedDelay;
                result.stops[j].estimatedTime = result.stops[j].scheduledTime + result.stops[j].estimatedDelay;
            }
            */

            return result;
        }
    }
    
    // TRAIN ACTIVE FUNCTIONS
    
    function isActiveScheduled(unixSeconds, train){
        return (train.begin < unixSeconds && train.end > unixSeconds)
    }
    
    function isActiveObserved(unixSeconds, train){
        return (train.ObservedBegin < unixSeconds && train.ObservedEnd > unixSeconds)
    }

    // DRAWING FUNCTIONS
    function renderAllAtTime(unixSeconds, transitionDisabled){
        
        /* Find all active trains:
        - either active based on schedule
        - either active based on observations
        */
        global.active = global.trips.filter(function (d) {
          return isActiveScheduled(unixSeconds, d) || isActiveObserved(unixSeconds, d) ;
        });
        
        // TODO: correct with toggle: either based on schedule, either based on realtime
        //global.finished = global.trips.filter(function (d) {
        //  return d.end < unixSeconds;
        //});
        
        //global.notYet = global.trips.filter(function (d) {
        //  return d.begin > unixSeconds;
        //});
        //console.log("Train positions at time "+unixSeconds+", meaning "+ moment(unixSeconds*1000).format() +". There are at this time "+ global.active.length +" trains running, "+ global.finished.length+" train arrived, and "+ global.notYet.length + " trains not departed yet.")    
        
        infoPanel();
        
        drawTrainsAtTime(unixSeconds, transitionDisabled);
        
        global.sectionMan.refreshAtTime(unixSeconds);
    }
    
    function drawStations(stations) {
        global.svg.selectAll(".station")
            .data(stations, function(d){return d.stop_id})
            .enter()
            .append("circle")
            .attr("cx", function(d){return d.lon})
            .attr("cy", function(d){return d.lat})
            .attr("r", 4)
            .classed("station", true)
            .on('mouseover', hoverStation)
            .on('mouseout', unHoverAny)    
    }
    
    function drawSections(sects) {
        // function computing svg path
        var lineFunction = d3.svg.line()
            .x(function(d) { if (d) {return d.lon; }})
            .y(function(d) { if (d) {return d.lat; }})
            .interpolate("cardinal");
        
        global.svg.selectAll(".section")
            .data(sects, function(d){return d.name})
            .enter()
            .append("path")
            .attr("d", function(d){console.log("Handling section "+d.name); return lineFunction(d.pointsCoord)})
            .classed("section", true)
            .on("click", function(d){console.log('Section '+d.name)})
            .each(function(d) { d.totalLength = this.getTotalLength(); });
    }
    
    function drawTrainsAtTime(unixSeconds, transitionDisabled) {
        
        // ARGS PARSING
        // checks time and transition time
        if (!unixSeconds) { unixSeconds = global.lastTime; }
        global.lastTime = unixSeconds;
        var ttime = global.transitionTime;
        if (transitionDisabled){ttime=0;}

        // FIND TRAINS POSITIONS
        var positionedTrains = global.active
            .map(getPositionOfTrain.bind(this, unixSeconds))
            .filter(function(train){
                if (!train){return; }
                if (isActiveScheduled.bind(this, unixSeconds)(train)&&(train.atTime.scheduled.pos && train.atTime.scheduled.acceptedEdge)){return train; }
                if (isActiveObserved.bind(this, unixSeconds)(train)&&(train.atTime.observed.pos && train.atTime.observed.acceptedEdge)){return train; }
            });
        
        // DISPLAY TRAINS
        var trainsGroups = global.svg.selectAll('g.train-group')
            .data(positionedTrains, function (d) { return d.trip; });
        
        // Enters
        var enteringGroups = trainsGroups.enter().append('g')
            .classed("train-group", true)
        
        // schedule
        enteringGroups
            .filter(function(d){
                return isActiveScheduled.bind(this, unixSeconds)(d)&& (d.atTime.scheduled.pos && d.atTime.scheduled.acceptedEdge)})
            .append('circle')
            .attr('class', function (d) { return 'highlightable hoverable dimmable ' + d.line; })
            .classed('active', function (d) { return d.trip === global.highlightedTrip; })
            .classed('hover', function (d) { return (d.trip === global.hoveredTrip) && (global.displayScheduled) ; })
            .classed("train", true)
            .classed("scheduled", true)
            //.on('click', function (d) { highlightTrain(d); })
            .on('mouseover', hoverTrain)
            .on('mouseout', unHoverAny)
            .on("click", function(d){console.log(d); console.log("scheduled")})
            .attr("r", 2)
            .attr("opacity", global.displayScheduled)
            .attr("fill","lightgreen")
            .attr('cx', function (d) {
                var p = stationIdToCoords(d.stops[0].stop_id);
                if (p){return p.lon;}
                else {return d.atTime.scheduled.pos[0];}
            })
            .attr('cy', function (d) { 
                var p = stationIdToCoords(d.stops[0].stop_id);
                if (p){return p.lat;}
                else {return d.atTime.scheduled.pos[1];}
            })
        ;
        
        // observed
        enteringGroups
            .filter(function(d){
                return isActiveObserved.bind(this, unixSeconds)(d)&& (d.atTime.observed.pos && d.atTime.observed.acceptedEdge)})
            .append('circle')
            .attr('class', function (d) { return 'highlightable hoverable dimmable ' + d.line; })
            .classed('active', function (d) { return d.trip === global.highlightedTrip; })
            .classed('hover', function (d) { return ((d.trip === global.hoveredTrip) && (global.displayObserved)); })
            .classed("train", true)
            .classed("observed", true)
            //.on('click', function (d) { highlightTrain(d); })
            .on('mouseover', hoverTrain)
            .on('mouseout', unHoverAny)
            .on("click", function(d){console.log(d); console.log("observed")})
            .attr("r", 2)
            .attr("opacity", global.displayObserved)
            .attr("fill","lightgreen")
            .attr('cx', function (d) {
                var p = stationIdToCoords(d.stops[0].stop_id);
                if (p){return p.lon;}
                else {return d.atTime.observed.pos[0];}
            })
            .attr('cy', function (d) { 
                var p = stationIdToCoords(d.stops[0].stop_id);
                if (p){return p.lat;}
                else {return d.atTime.observed.pos[1];}
            })
        ;


        // Update schedule
        trainsGroups.select(".train.scheduled")
            .filter(function(d){
                return isActiveScheduled.bind(this, unixSeconds)(d)&& (d.atTime.scheduled.pos && d.atTime.scheduled.acceptedEdge)})
            .transition()
            .duration(ttime)
            .attr('cx', function (d) { return d.atTime.scheduled.pos[0]; })
            .attr('cy', function (d) { return d.atTime.scheduled.pos[1]; })
            .attr("fill", "steelblue")
            .attr("r", 4)
            .attr("opacity", global.displayScheduled)

        // Update observed
        trainsGroups.select(".train.observed")
            .filter(function(d){
                return isActiveObserved.bind(this, unixSeconds)(d)&& (d.atTime.observed.pos && d.atTime.observed.acceptedEdge)})
            .transition()
            .duration(ttime)
            .attr('cx', function (d) { return d.atTime.observed.pos[0]; })
            .attr('cy', function (d) { return d.atTime.observed.pos[1]; })
            .attr("fill", function(d) {return delayMapColorScale(d.atTime.observed.estimatedDelay); })
            .attr("r",4)
            .attr("opacity", global.displayObserved)

        
        // Exit
        trainsGroups.exit()
            .select(".train")
            .transition()
            .duration(ttime)
            // first finish till last station then disapear
            .attr('cx', function (d) {return stationIdToCoords(d.stops[d.stops.length-1].stop_id).lon; })
            .attr('cy', function (d) {return stationIdToCoords(d.stops[d.stops.length-1].stop_id).lat; })
            .attr("fill","purple")            
            .attr("r", 3)
            .remove();

        trainsGroups.exit()
            .transition()
            .delay(ttime)
            .remove();
    }
    
    // POSITION AND NETWORK FUNCTIONS  
    function networkPreprocessing(){
        /* build array of stations-sections relationships:
        {
            stopId: "stopId",
            linkedSections:["sectionName1", "sectionName2" ... ]
        }
        
        Then build graph of main nodes
        */
        global.nodes = [];
        global.sections.forEach(function(section){
            // for each section
            section.points.forEach(function(point){
                // for each point in section
                // find related station
                var station = global.stations.find(function(station){return (station.stop_id===point);})
                // check that section is registered as linked for this station, add if necessary
                if (!station.linkedSections.includes(section.name)){station.linkedSections.push(section.name);}
            })
            ;
        });
        
        // create graph of with only main nodes and sections
        global.mainGraph = new global.Graph();
        global.sections.forEach(function(section){
            var beginNode = section.endPoints[0];
            var endNode = section.endPoints[1];
            global.mainGraph.addEdge(beginNode, endNode);
        });
        console.log("Main graph created.");
        
        // create graph of all stations (small nodes) and subsections
        global.preciseGraph = new global.Graph();
        global.sections.forEach(function(section){
            for (var l=0; l<section.points.length-1; l++){
                var beginNode = section.points[l];
                var endNode = section.points[l+1];
                global.preciseGraph.addEdge(beginNode, endNode);
            }
        }
        );
        console.log("Precise graph created.");
        
        // Create sections manager
        global.sectionMan = new global.SectionManager();

    }
      
    function preprocessTrainPathWithTime(train){
        /* The goal is to find (station, time) of all stations for which the train doesn't stop.
        
        The first part is to know by which stations a train has passed, even if it doesn't stop at these stations
        it will add for each station the shortest path to the next station (array of stations at which it doesn't stop).
           {nextStations = []}
        OK
        
        Then it will have to extrapolate at what time the train is supposed to pass at these stations:
        - first calculate total time from initial station to next station: OK
        - find total distance between these stations, passing by found path: OK
        - assign to each subsection a spent time: OK
        - calculate timestamp: OK
        
        Add guessed stops in stops: array of:
        {
            stop_id:"***",
            time: ***
        }
        */
        
        for (var i=0; i<train.stops.length-1; i++){
            var fromStop = train.stops[i];
            var toStop = train.stops[i+1];
            
            // Find path between two consecutive stops
            fromStop.nextPath=global.preciseGraph.shortestPath(fromStop.stop_id, toStop.stop_id);
            
            // If no station passed without stop, or error trying to find: finished
            if (!fromStop.nextPath){continue;}
            if (fromStop.nextPath.length===0){continue;}
            
            // Else find time spent between stops
            fromStop.sectionTimeSecs = toStop.scheduledTime - fromStop.scheduledTime;
            
            // Find total distance between stops
            // Sum of all subsections, and list of subsections distances
            var totalDistance = 0;
            var distancesList = [];
            // add beginning and end
            var iniDist = stationsDistance(fromStop.stop_id, fromStop.nextPath[0]);
            totalDistance += iniDist
            distancesList.push(iniDist);
            var endDist = stationsDistance(toStop.stop_id, fromStop.nextPath[fromStop.nextPath.length-1]);
            totalDistance += endDist;
            // distancesList.push(endDist);
            for (var m=0; m<fromStop.nextPath.length-1;m++){
                var subsectionDistance = stationsDistance(fromStop.nextPath[m], fromStop.nextPath[m+1]);
                distancesList.push(subsectionDistance);
                totalDistance += subsectionDistance;
            }
            // Assign "distanceTillNextStop" to train's last stop
            fromStop.distanceTillNextStop = totalDistance;
            
            // Assign ratio of distance for each subsection to train's last stop
            fromStop.ratioList = cumulativeSum(distancesList.map(function(d){return d/totalDistance;}));
            // assign spent time to ...
            var timeList = fromStop.ratioList.map(function(r){return r*fromStop.sectionTimeSecs;})
            // and finally assign Timestamp: seconds + initial timestamp to ...
            fromStop.timestampList = timeList.map(function(t){return t+fromStop.scheduledTime;})
            
        }
        
        /* Build concatenated path
        By simply adding stations without stops to train path.
        
        for a given train, for each stop in its stops, add array to stops:
        {
            stop_id: "***",
            time: "***",
            realStop: false
        }
        
        */
        var guessedStops = [];
        train.stops.forEach(function(stop){
            // find guessed passed stations
            // if not found stop
            if (!stop.nextPath){return;}
            
            for (var h=0; h<stop.nextPath.length; h++){
                var g= {
                    stop_id: stop.nextPath[h],
                    scheduledTime: stop.timestampList[h],
                    realStop: false
                };
                guessedStops.push(g);
            };
        });
        train.stops = train.stops.concat(guessedStops);
        // Order stop by time (necessary for positioning functions)
        train.stops = _.sortBy(train.stops, function(o) { return o.scheduledTime; });
        
        /* Reassign lastObservedDelay to each station (real stop or not)
        Note: this is exactly the same operation as in parsing trips.
        The reason why we do it also in parsing, it that it allows us to define real beginning of trip (with delays), 
        and real end.
        We might do all here (and delete it in parsing operation).
        
        TODO: smoothen delay estimation based on next observed delay, so that if there are several subsections between 
        observed delays then it doesn't change at the last subsection.
        
        */ 
        for (var j=0; j<train.stops.length; j++){
            if (j===0){
                train.stops[0].estimatedDelay = train.stops[0].delay || 0;
                train.stops[0].estimatedTime = train.stops[0].scheduledTime + train.stops[0].estimatedDelay;
                continue;
            }
            // estimatedDelay is this stop delay, or if not exists estimatedDelay of previous stop
            train.stops[j].estimatedDelay = train.stops[j].delay || train.stops[j-1].estimatedDelay;
            train.stops[j].estimatedTime = train.stops[j].scheduledTime + train.stops[j].estimatedDelay;
        }
        
        // Find begining and end based on observed times
        // ObservedBegin, ObservedEnd
        train.ObservedBegin = _.min(train.stops, function(stop){return stop.estimatedTime}).estimatedTime;
        train.ObservedEnd = _.max(train.stops, function(stop){return stop.estimatedTime}).estimatedTime;

    }
    
    function stationIdToCoords(id){
        // convert station_id to longitude and latitude
        var stat = _.find(
            global.stations, 
            function(station){
                return (station.stop_id === id);}
        );
        if (stat){
            return {lon: stat.lon, lat: stat.lat};
        }
        // console.log("Cound not find station "+id)
        // can be possible for some stations, like gare du nord, because of last digit change
        var stat = _.find(
            global.stations, 
            function(station){
                return station.stop_id.startsWith(id.slice(0,-1));}
        );
        if (stat){
            //console.log("Found nearly the same: "+id+" vs "+stat.stop_id)
            // console.log(stat)
            return {lon: stat.lon, lat: stat.lat}
        }
        // console.log("Could not find stations, even with close try: id "+id);
        return; //{lon: 0, lat: 0};
    }
    
    function stationsDistance(fromId, toId){
        // scaled because everything is scaled at the beginning
        var fromCoords = stationIdToCoords(fromId);
        var toCoords = stationIdToCoords(toId);
        
        var distance = Math.sqrt((fromCoords.lon - toCoords.lon)**2+(fromCoords.lat - toCoords.lat)**2)
        return distance;
}
    
    function getPositionOfTrain(unixSeconds, train){
        /*
        Find positions based on schedule and based on observations.
        
        TODO: take into account if real stops or not.
        */
        
        // SCHEDULED
        // Find which is last passed station
        for (var i = 0; i < train.stops.length - 1; i++) {
            if (train.stops[i + 1].scheduledTime > unixSeconds) {
            break;
            }
        }
        var sfrom = train.stops[i];
        var sto = train.stops[i + 1];
        
        var sacceptedEdge, sratio, spos;
        
        if (sfrom && sto){
            // console.log("SCHEDULE: Could not find previous or next for trip "+train.trip);
            // Check if real edge of precise graph
            sacceptedEdge = global.preciseGraph.isEdge(sfrom.stop_id, sto.stop_id);
            //console.log("Train "+ train.trip+" is not real edge between "+from.stop_id+" and "+ to.stop_id+ "."); 

            // Find ratio
            sratio = (unixSeconds - sfrom.scheduledTime) / (sto.scheduledTime - sfrom.scheduledTime);

            // compute atTime object given: from, to and ratio
            spos = placeWithOffset(sfrom, sto, sratio);
        }
        
        
        var scheduled = {
            from: sfrom,
            to: sto,
            timeRatio: sratio,
            pos: spos,
            acceptedEdge: sacceptedEdge
        };
        
        // OBSERVED (with extrapolation when no data is found)
        for (var j = 0; j < train.stops.length - 1; j++) {
            if (train.stops[j + 1].estimatedTime > unixSeconds) {
            break;
            }
        }
        
        var efrom = train.stops[j];
        var eto = train.stops[j + 1];
        
        var eacceptedEdge, eratio, epos, previousEstimatedDelay, nextEstimatedDelay, estimatedDelayEvolution, estimatedDelay;
        
        if (efrom && eto){
            // console.log("OBSERVED Could not find previous or next for trip "+train.trip);
            // Check if real edge of precise graph
            eacceptedEdge = global.preciseGraph.isEdge(efrom.stop_id, eto.stop_id);
            //console.log("Train "+ train.trip+" is not real edge between "+from.stop_id+" and "+ to.stop_id+ "."); 
    
            // Find ratio
            eratio = (unixSeconds - efrom.estimatedTime) / (eto.estimatedTime - efrom.estimatedTime);
        
            // compute atTime object given: from, to and ratio
            epos = placeWithOffset(efrom, eto, eratio);
            
            previousEstimatedDelay = efrom.estimatedDelay;
            nextEstimatedDelay = eto.estimatedDelay;
            
            estimatedDelayEvolution = nextEstimatedDelay - nextEstimatedDelay;
            estimatedDelay = eratio*nextEstimatedDelay + (1-eratio)*previousEstimatedDelay;
            
        }

        var observed = {
            from: efrom,
            to: eto,
            timeRatio: eratio,
            pos: epos,
            acceptedEdge: eacceptedEdge,
            previousEstimatedDelay: previousEstimatedDelay,
            nextEstimatedDelay: nextEstimatedDelay,
            estimatedDelayEvolution: estimatedDelayEvolution,
            estimatedDelay: estimatedDelay
        };
        
        train.atTime = {
            renderedAtTime: unixSeconds,
            scheduled: scheduled,
            observed : observed
        };
        return train;
    }
        
    function placeWithOffset(from, to, ratio) {
        
        // extrapolate position from trip ratio, previous station, and next station
        var fromPos = stationIdToCoords(from.stop_id);
        var toPos = stationIdToCoords(to.stop_id);
        if (!fromPos || !toPos){
            //console.log("Error for localization: from: "+from+", to: "+to+", ratio: "+ratio+". Could not find stations coordinates for From or To station. From: "+fromPos+". To: "+toPos+".")
            return;
        }
        
        var midpoint = d3.interpolate([fromPos.lon, fromPos.lat], [toPos.lon,toPos.lat])(ratio);
        var angle = Math.atan2(toPos.lat - fromPos.lat, toPos.lon - fromPos.lon) + Math.PI / 2;
        return [midpoint[0] + Math.cos(angle) * global.mapGlyphTrainCircleRadius, midpoint[1] + Math.sin(angle) * global.mapGlyphTrainCircleRadius ];
    }
    
    // SCALING FUNCTION
    
    function setScale(stations, h, w, border){
        // Set scales for GPS coordinates placed on SVG object
        var x = d3.scale.linear()
            .domain(d3.extent(stations, function(station){return station.lon;}))
            .range([border, w-border]);
        global.xScale = x;

        var y = d3.scale.linear()
            .domain(d3.extent(stations, function(station){return station.lat;}))
            // inverted range because of coordinates inverted
            .range([(h-border),border]);
        global.yScale = y;
    }
    
    // VIZ FUNCTIONS
    function toolTipInit(){
        // Define the div for the tooltip
        global.toolTip = d3.select("body").append("div")	
            .attr("class", "tooltip")				
            .style("opacity", 0);
    }
    
    function highlightTrain(d) {
        if (d === null) {
            highlightedTrip = null;
        } else {
            highlightedTrip = d.trip;
        }
        highlight();
        d3.event.stopPropagation();
      }
    
    function unHoverAny() {
        global.toolTip.transition()		
            .duration(500)		
            .style("opacity", 0);	
        //hoveredTrip = null;
        //hover();
    }
    
    function hoverAny(d){
        global.toolTip
            .style("left", (d3.event.pageX) + "px")		
            .style("top", (d3.event.pageY - 28) + "px")
            .transition()		
            .duration(200)		
            .style("opacity", .8);   
    }
    
    function hoverTrain(d) {
        //hoveredTrip = d.trip;
        hoverAny(d);
        global.toolTip
            .text("Train "+d.trip+" currently going from station "+ d.atTime.observed.from.stop_id+" to station "+ d.atTime.observed.to.stop_id+", has an estimated delay of "+d.atTime.observed.previousEstimatedDelay+" seconds.");
        }
    
    function hoverStation(d) {
        //hoveredTrip = d.trip;
        hoverAny(d);
        global.toolTip
            .text("Station "+d.name+" with stop id "+ d.stop_id);
        }
    
    function brushed() {
        var lo = brush.extent()[0] / 1000;
        var hi = brush.extent()[1] / 1000;
        d3.selectAll('.lined-up .mareyline')
            .style('opacity', function (d) {
            return lo < d.secs && hi > d.secs ? 0.7 : 0.1;
        });
    }
    
    function hover() {
        d3.selectAll('.hoverable')
        .classed('hover', function (d) { return d.trip === hoveredTrip; });
    }
    
    function infoPanel(){
        //$( "#nbNotYetTrains" ).text(global.notYet.length);
        $( "#nbActiveTrains" ).text(global.active.length);
        //$( "#nbFinishedTrains" ).text(global.finished.length);
        $( "#nbDisplayError" ).text(global.activeTripsWithoutPosAtTime().length);
    }
    
    // COLOR
    function delayMapColorScale(delay){
        // takes into account missing values
        var colorScale = d3.scale.linear()
            .interpolate(d3.interpolateLab)
            .domain([-300, 0, 200, 600])
            .range(['rgb(31, 165, 51)', 'rgb(156, 237, 168)', 'rgb(249, 204, 59)', 'rgb(165, 0, 38)']);
        return colorScale(delay);
    }
    
    // SLIDER AND TIMER FUNCTIONS
    function renderTimeSlider(min, max) {
        $( "#slider" ).slider({
            step: 2,
        orientation:"horizontal",
          animate: "slow",
          value: min+18000,
          min: min,
          max: max,
          slide: function( event, ui ) {
            $( "#slider-text" ).text(moment(ui.value*1000).format("MMMM Do YYYY, h:mm:ss a"));
            $( "#slider-title" ).text(moment(ui.value*1000).format("MMMM Do YYYY, h:mm:ss a"));

            renderAllAtTime(ui.value, true);
            global.renderingTimeStamp = ui.value;
          },
          change: function( event, ui ) {
            renderAllAtTime(ui.value);
            global.renderingTimeStamp = ui.value;
            $( "#slider-text" ).text(moment(ui.value*1000).format("MMMM Do YYYY, h:mm:ss a"));
            $( "#slider-title" ).text(moment(ui.value*1000).format("MMMM Do YYYY, h:mm:ss a"));

            }
        });
    } 
    
    function sliderTimerUpdate(){
        // set value
        // previous time
        var previous = $("#slider").slider("option", "value");
        
        $("#slider").slider('value', previous+global.timerAdd);
        if (global.timerActivated){
            setTimeout(sliderTimerUpdate, global.timerDelay);
        }
    }
    
    function setButtonInitialState(){
        // Timer button
        $("#button").on("click", function(){
            global.timerActivated = !global.timerActivated; 
            sliderTimerUpdate();
        });
        // Scheduled button
        $("#scheduled").closest('label').on("click", function(){
            console.log("Display Schedule");
            global.displayScheduled = 1; 
            global.displayObserved = 0; 

        });
        // Observed button
        $("#observed").closest('label').on("click", function(){
            console.log("Display Observed");
            global.displayObserved = 1; 
            global.displayScheduled = 0; 

        });
    }
    
    function renderSpeedSlider() {
        $( "#speed" ).slider({
            orientation:"horizontal",
            animate: "slow",
            value: global.timeSpeed,
            min: 0,
            max: 500,
            slide: function( event, ui ) {
            $( "#speed-value" ).text(ui.value);
            global.timeSpeed = ui.value;
            recomputeTiming();
          }
        });
    }
    
    function renderTimerDelaySlider() {
        $( "#timer-delay" ).slider({
            orientation:"horizontal",
            animate: "slow",
            value: global.timerDelay,
            min: 15,
            max: 150,
            slide: function( event, ui ) {
            $( "#timer-delay-value" ).text(ui.value);
            global.timerDelay = ui.value;
            recomputeTiming();
          }
        });
    } 
    
    function recomputeTiming(){
        global.timerAdd = global.timerDelay*global.timeSpeed/1000; // will add n seconds at each iteration
        // Transition time (shouldn't be much bigger than timerDelay)
        global.transitionTime = global.timerDelay * global.smoothness;
    }
    
    // SPECIFIC GRAPHS
    // AFFLUENCE ON SECTION
    
    function computeActiveTrainsPerTime(){
        /* returns in following format: array of:
        {
            date: timestamp,
            total: NbOfActiveTrains,
            meanDelay: meanDelay
        }
        
        */
        global.activeTrainsData = [];
        for (var unixSeconds=global.minUnixSeconds; unixSeconds<global.maxUnixSeconds; unixSeconds+=600){
            
            var active = global.trips.filter(isActiveObserved.bind(this,unixSeconds));
            
            active.map(getPositionOfTrain.bind(this, unixSeconds))
                .filter(function(train){
                if (!train){return; }
            });

            var meanDelay = _.reduce(active.map(function(trip){return trip.atTime.observed.estimatedDelay;}), function(memo, num){ return memo + num; }, 0)/active.length;
            
            global.activeTrainsData.push({
                date: unixSeconds*1000,
                total: active.length,
                meanDelay: meanDelay
            });
        }
    }
    
    // TROUBLESHOOTING FUNCTIONS
    global.tripsWithPassedStations = function (){
        // for troubleshooting, returns list of trips with identified passing stations
        return global.trips.filter(function(trip){
            // among all stops
            return trip.stops.find(function(stop){
                // has a non undefined nextPath attribute
                if (!stop.nextPath){return;}
                if (stop.nextPath.length>0){return true;}
            });
        });
        
    }
    
    global.tripsWithPrecisePathError = function (){
        // for troubleshooting, returns list of trips with identified passing stations
        var tripsWithErrors = global.trips.filter(function(trip){
            // that among all stops
            var lastStopId = trip.stops[trip.stops.length-1].stop_id;
            var hasStopError = trip.stops.find(function(stop){
                // have a non undefined nextPath attribute (while being a true stop)
                // except last stop that never has nextPath
                
                return ((!stop.nextPath)&&(stop.realStop)&&(stop.stop_id!==lastStopId));
            });
            return hasStopError;
        });
        return tripsWithErrors;
    }
    
    global.activeTripsWithoutPosAtTime = function(){
        // to know which trains haven't been displayed because of errors
        return global.active
            .filter(function(trip){
                var train = getPositionOfTrain.bind(this, global.renderingTimeStamp)(trip);
                if (!train){return;}
                if (!train.atTime.scheduled.pos){return true};
        });
    }
    
    global.stopIdToStop = function(stopId){
        return global.stations.find(function(stop){return stop.stop_id === stopId;})
    };
    
    // MATH FUNCTION
    
    function cumulativeSum(arr) {
        var builder = function (acc, n) {
            var lastNum = acc.length > 0 ? acc[acc.length-1] : 0;
            acc.push(lastNum + n);
            return acc;
        };
        return _.reduce(arr, builder, []);
    }
    
    // EXPRESSIONS HERE: before only function statements
    VIZ.requiresData(['json!data/clean_data/stations.json','json!data/clean_data/h_sections.json', 'json!data/clean_data/trains.json'], true)
        .done(function(stations, sections, trips){
        
        //// PARAMETERS
        // Canvas parameters
        var w = 500, h = 500, border=20;
        // Chosen line
        global.line="H";
        // Size of trains: to compute distance from path
        global.mapGlyphTrainCircleRadius = 5.5;
        
        // Timer
        global.smoothness = 0.6;
        global.timeSpeed = 50; // time x60
        global.timerDelay = 80; // new update every n milliseconds
        global.timerAdd = global.timerDelay*global.timeSpeed/1000; // will add n seconds at each iteration
        // Transition time (shouldn't be much bigger than timerDelay)
        global.transitionTime = global.timerDelay * global.smoothness;
        
        
        //// INIT
        // Init map svg
        global.svg = d3.select("#map")
            .append("svg")
            .attr("width", w)
            .attr("height", h);
        
        // init cache results
        global.cache = {};
        global.cache.stationsDistances = [];
        global.errors = {};
        global.errors.stopNoCoords = [];
        global.errors.stopNoNeighboor = [];
        
        // Highlight and hover init
        global.highlightedTrip = null;
        global.hoveredTrip = null;
        
        // Scheduled or observed
        global.displayScheduled = 0;
        global.displayObserved = 1;
        
        // Functions init
        global.isActiveObserved = isActiveObserved;
        global.isActiveScheduled = isActiveScheduled;
        // For debug
        global.stationIdToCoords = stationIdToCoords;
        global.delayMapColorScale = delayMapColorScale;
        
        //// DATA IMPORT, PARSING, SCALING OF STATIONS
        // Stations are imported before because their coordinates are used for scaling, and then used to compute
        // sections coordinates.
        var parsedStations = stations.map(parseStation).filter(function(station){if (station){return station}});
        // Compute svg scale given stations positions
        setScale(parsedStations, h, w, border)
        // Rescale coordinates of all stations
        global.stations = parsedStations.map(function(station){
            station.lon = global.xScale(station.lon); 
            station.lat = global.yScale(station.lat); 
            return station;
        });
        
        //// DATA IMPORT, PARSING OF SECTIONS AND TRIPS
        // Sections
        global.sections = sections.map(parseSection);
        // Graph preprocessing (to then find trains shortest paths between stations)
        networkPreprocessing();
        
        // Trains
        var parsedTrips = trips.map(parseTrip).filter(function(trip){if (trip){return trip}});
        global.trips = parsedTrips;
        // Find train shortest paths and estimate time with delay
        global.trips.forEach(preprocessTrainPathWithTime);
        
        // Finding trains range of dates
        global.minUnixSeconds = d3.min(d3.values(trips), function (d) { return d.begin; });
        global.maxUnixSeconds = d3.max(d3.values(trips), function (d) { return d.end; });
    
        
        //// DRAWING STATIONS AND SECTIONS
        // Sections
        drawSections(global.sections);
        // Stations
        drawStations(global.stations);
        // Tooltip hover over Map of trains and stations
        toolTipInit();
        
        // RENDERING SLIDERS AND TIMERS
        // Timer button
        setButtonInitialState();
        // Lasttime init
        global.lastTime = global.minUnixSeconds;
        // Slider init
        renderTimeSlider(global.minUnixSeconds, global.maxUnixSeconds);
        // Speed slider
        renderSpeedSlider();
        // TimerDelay slider
        renderTimerDelaySlider();

        // DRAWING TRAINS INFO PANEL AT INITIAL TIME
        //console.log("Display at timestamp "+ global.minUnixSeconds)
        renderAllAtTime(global.minUnixSeconds);
        
        
        // CHART - ACTIVE TRAINS
        // Computes data along whole day
        computeActiveTrainsPerTime();
        // Generates chart
        global.generateActiveTrainsChart();

    
    });
    }(window.H));