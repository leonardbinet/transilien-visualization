(function (global) {
    "use strict";
    /*
    STEPS:
    Draw canvas: OK
    Load sections paths and draw paths: OK
    Load and draw stations circles: OK
    Load day trips: preprocessing on python module
    For given t: 
    - filter currently active trains : OK
    - find two-stations section (between 2 stations, one passed, the other not): TODO
    - find trip global route (which sections it uses): TODO
    - find trip local route (on which section it is now): TODO
    - find trip global completion ratio: OK
    - find trip local completion ratio: more important: TODO
    - find current location on section path: PARTIAL
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
        var ro = {
            name: d.name,
            // list of stop_ids
            endPoints: endPoints,
            // d.endpoints.map(function(o){return Object.keys(o)[0]}),
            // list of stop_ids
            points: points,
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
            return {
                begin: +d.begin,
                end: +d.end,
                line: d.line,
                trip: d.trip,
                stops: d.stops.map(function(stop){
                    stop.time = +stop.time;
                    if (stop.delay){
                        stop.delay = +stop.delay;
                    }
                    stop.realStop = true;
                    return stop;
                }),
                secs: secs
            }
        }
    }

    // DRAWING FUNCTIONS
    function renderAllAtTime(unixSeconds, transitionDisabled){
        global.active = global.trips.filter(function (d) {
          return d.begin < unixSeconds && d.end > unixSeconds;
        });
                
        global.finished = global.trips.filter(function (d) {
          return d.end < unixSeconds;
        });
        
        global.notYet = global.trips.filter(function (d) {
          return d.begin > unixSeconds;
        });
        //console.log("Train positions at time "+unixSeconds+", meaning "+ moment(unixSeconds*1000).format() +". There are at this time "+ global.active.length +" trains running, "+ global.finished.length+" train arrived, and "+ global.notYet.length + " trains not departed yet.")    
        
        infoPanel();
        
        drawTrainsAtTime(unixSeconds, transitionDisabled);
    }
    
    function drawStations(stations) {
        global.svg.selectAll(".station")
            .data(stations, function(d){return d.stop_id})
            .enter()
            .append("circle")
            .attr("r", 5)
            .attr("cx", function(d){return d.lon})
            .attr("cy", function(d){return d.lat})
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
    
    function drawSmallSections(){
        
    }
    
    function drawTrainsAtTime(unixSeconds, transitionDisabled) {
        // checks time provided, if null takes minimum of day
        if (!unixSeconds) { unixSeconds = global.lastTime; }
        global.lastTime = unixSeconds;

        var positionedTrains = global.active
            .map(getPositionOfTrain.bind(this, unixSeconds))
            .filter(function(pos){if (pos){return pos}});
        
        var transitionTime = 1000
        
        // selects groups, bind data
        var trainsG = global.svg.selectAll('g.train')
            .data(positionedTrains, function (d) { return d.trip; });
            
        // Enter
        trainsG.enter().append('g')
            .classed("train", true)
            .append('circle')
            .attr('class', function (d) { return 'train scheduled highlightable hoverable dimmable ' + d.line; })
            .classed('active', function (d) { return d.trip === global.highlightedTrip; })
            .classed('hover', function (d) { return d.trip === global.hoveredTrip; })
            //.on('click', function (d) { highlightTrain(d); })
            .on('mouseover', hoverTrain)
            .on('mouseout', unHoverAny)
            .on("click", function(d){console.log('Trip '+d.trip)});
        
        
        var scheduledTrainsToUpdate =  trainsG.select(".train.scheduled");
        var scheduledTrainsToExit = trainsG.exit();
        
        if (!transitionDisabled){
            scheduledTrainsToUpdate = scheduledTrainsToUpdate
                .transition()
                .duration(transitionTime);
            
            scheduledTrainsToExit
                .select(".train.scheduled")
                .transition()
                .duration(transitionTime/2)
                // first finish till last station then disapear
                .attr('cx', function (d) { var coord = stationIdToCoords(d.stops[d.stops.length-1].stop_id); if (coord){return coord.lon;}})
                .attr('cy', function (d) { var coord = stationIdToCoords(d.stops[d.stops.length-1].stop_id); if (coord){return coord.lat;}})
                .attr("fill","gray");
        }
        
        scheduledTrainsToUpdate
            .attr('cx', function (d) { return d.atTime.pos[0]; })
            .attr('cy', function (d) { return d.atTime.pos[1]; })
            .attr("fill", function(d) {return delayMapColorScale(d.atTime.estimatedDelay); });
        
        scheduledTrainsToExit
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
        console.log("Main graph created.")
        
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
        console.log("Precise graph created.")
    }
      
    function findTrainPathWithTime(train){
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
        
        // find path between stations (stop at length-2)
        // console.log("Looking for shortest path of train "+train.trip)
        for (var i=0; i<train.stops.length-1; i++){
            var fromStop = train.stops[i];
            var toStop = train.stops[i+1];
            
            // First find path
            fromStop.nextPath=global.preciseGraph.shortestPath(fromStop.stop_id, toStop.stop_id);
            
            // If no station passed without stop, or error trying to find: finished
            if (!fromStop.nextPath){continue;}
            if (fromStop.nextPath.length===0){continue;}
            
            // Then find time spent between station
            fromStop.sectionTimeSecs = toStop.time - fromStop.time;
            
            // Find total distance between from and to stations
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
            fromStop.distanceTillNextStop = totalDistance;
            
            // assign ratio of distance for each subsection
            fromStop.ratioList = cumulativeSum(distancesList.map(function(d){return d/totalDistance;}));
            // assign spent time
            var timeList = fromStop.ratioList.map(function(r){return r*fromStop.sectionTimeSecs;})
            // and finally assign Timestamp: seconds + initial timestamp
            fromStop.timestampList = timeList.map(function(t){return t+fromStop.time;})
            
        }
        
        /* build concatenated path
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
                    time: stop.timestampList[h],
                    realStop: false
                };
                guessedStops.push(g);
            };
        });
        train.stops = train.stops.concat(guessedStops);
        
        // do not forget to order stop by time (necessary for positioning functions)
        train.stops = _.sortBy(train.stops, function(o) { return o.time; });

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
            console.log("Found nearly the same: "+id+" vs "+stat.stop_id)
            // console.log(stat)
            return {lon: stat.lon, lat: stat.lat}
        }
        console.log("Could not find stations, even with close try: id "+id);
        //return {lat: 48.934456, lon: 2.345604};
        return;
    }
    
    function stationsDistance(fromId, toId){
        // scaled because everything is scaled at the beginning
        var fromCoords = stationIdToCoords(fromId);
        var toCoords = stationIdToCoords(toId);
        
        var distance = Math.sqrt((fromCoords.lon - toCoords.lon)**2+(fromCoords.lat - toCoords.lat)**2)
        return distance;
}
    
    function getPositionOfTrain(unixSeconds, train){
        // console.log(train);
        // get prev, next stop and mix
        for (var i = 0; i < train.stops.length - 1; i++) {
            if (train.stops[i + 1].time > unixSeconds) {
            break;
            }
        }
        // find the datapoint before and after this time and interpolate
        var from = train.stops[i];
        var to = train.stops[i + 1];
        if (!from || !to){console.log("Could not find previous or next for trip "+train.trip);return ;}
        // check if real edge of precise graph
        if (!global.preciseGraph.isEdge(from.stop_id, to.stop_id)){console.log("Train "+ train.trip+" is not real edge between "+from.stop_id+" and "+ to.stop_id+ "."); return;}
        var lastDelay = from.delay;
        var ratio = (unixSeconds - from.time) / (to.time - from.time);
        
        // compute atTime object given: from, to and ratio
        var pos = placeWithOffset(from, to, ratio);
        if (!pos){return;}
        train.atTime = {
            time: unixSeconds,
            from: from,
            estimatedDelay: lastDelay,
            to: to,
            from: from,
            timeRatio: ratio,
            pos: pos
        };

        return train; //{trip: train.trip, pos: pos, line: train.line};
        
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
    
    // MISC FUNCTIONS
    
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
            .text("Train "+d.trip+" currently going from station "+ d.atTime.from.stop_id+" to station "+ d.atTime.to.stop_id+".");
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
        $( "#nbNotYetTrains" ).text(global.notYet.length);
        $( "#nbActiveTrains" ).text(global.active.length);
        $( "#nbFinishedTrains" ).text(global.finished.length);
    }
    
    // COLOR
    function delayMapColorScale(delay){
        if (!delay){return "steelblue";}
        // takes into account missing values
        // if missing, blue
        var colorScale = d3.scale.linear()
            .interpolate(d3.interpolateLab)
            .domain([-300, 0, 600])
            .range(['rgb(0, 104, 55)', 'rgb(255, 255, 255)', 'rgb(165, 0, 38)']);
        return colorScale(delay);
    }
    // global.delayMapColorScale = delayMapColorScale
    
    // SLIDER AND TIMER FUNCTIONS
    function renderSlider(min, max) {
        $( "#slider" ).slider({
            step: 2,
        orientation:"horizontal",
          animate: "slow",
          value: min,
          min: min,
          max: max,
          slide: function( event, ui ) {
            $( "#slider-text" ).text(moment(ui.value*1000).format("MMMM Do YYYY, h:mm:ss a"));
            renderAllAtTime(ui.value, true);
            global.renderingTimeStamp = ui.value;
          },
          change: function( event, ui ) {
            renderAllAtTime(ui.value);
            global.renderingTimeStamp = ui.value;
            $( "#slider-text" ).text(moment(ui.value*1000).format("MMMM Do YYYY, h:mm:ss a"));
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
        $("#button").on("click", function(){
            global.timerActivated = !global.timerActivated; 
            sliderTimerUpdate();
            //$("#button").button('toggle');
        });
    }
    
    // SPECIFIC GRAPHS
    // AFFLUENCE ON SECTION
    
    function computeActiveTrainsPerTime(){
        /* returns in following format: array of:
        {
            date: timestamp,
            section1: NbOfActiveTrains,
            section2: NbOfActiveTrains,
            section3: NbOfActiveTrains
        }
        
        */
        global.activeTrainsData = [];
        for (var i=global.minUnixSeconds; i<global.maxUnixSeconds; i+=600){
            
            var active = global.trips.filter(function (d) {
                return (d.begin < i && d.end > i);
            });
            
            global.activeTrainsData.push({
                date: i*1000,
                id: ""+i*1000,
                total: active.length
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
                var pos = getPositionOfTrain.bind(this, global.renderingTimeStamp)(trip);
                if (!pos){return true};
        });
    }
    
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
        
        // Draw canvas
        var w = 500, h = 500, border=20;

        global.svg = d3.select("#map")
            .append("svg")
            .attr("width", w)
            .attr("height", h);

        global.line="H";
        
        // init cache results
        global.cache = {};
        global.cache.stationsDistances = [];
        global.errors = {};
        global.errors.stopNoCoords = [];
        global.errors.stopNoNeighboor = [];
        
        var parsedStations = stations.map(parseStation).filter(function(station){if (station){return station}});
    
        setScale(parsedStations, h, w, border)
        
        // scale coordinates of all stations so we don't have anymore to bother about scales
        global.stations = parsedStations.map(function(station){station.lon = global.xScale(station.lon); station.lat = global.yScale(station.lat); return station})
        
        // Sections; routes
        var parsedSections = sections.map(parseSection);
        // so that we still have access to it
        global.sections = parsedSections;
        drawSections(parsedSections);
        // we draw stations last
        drawStations(parsedStations);

        // TRIPS
        var parsedTrips = trips.map(parseTrip).filter(function(trip){if (trip){return trip}});
        global.trips = parsedTrips;
        // adds a secs on each trip
        
        global.mapGlyphTrainCircleRadius = 7;

        global.minUnixSeconds = d3.min(d3.values(trips), function (d) { return d.begin; });
        global.maxUnixSeconds = d3.max(d3.values(trips), function (d) { return d.end; });
        renderSlider(global.minUnixSeconds, global.maxUnixSeconds)

        
        // Render train dots onto the map glyph at a particular point in time
        global.lastTime = global.minUnixSeconds;
        
        // Initialization
        global.highlightedTrip = null;
        global.hoveredTrip = null;
        
        // Train display at Time
        console.log("Display of trains at timestamp "+ global.minUnixSeconds)
        renderAllAtTime(global.minUnixSeconds);
        
        
        // TIMER PARAMETERS
        global.timerAdd = 60;
        global.timerDelay = 800;
        
        // Slider
        setButtonInitialState();
        
        // Tooltip hover over Map
        toolTipInit();
        
        // Graph preprocessing
        networkPreprocessing();
        
        // Trains shortest shortest paths
        global.trips.forEach(findTrainPathWithTime);
        
        // Active trains among day for below chart
        computeActiveTrainsPerTime();
        global.generateActiveTrainsChart();
    
    });
    }(window.H));