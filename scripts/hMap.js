window.H= {};
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
                stops: d.stops.map(function(stop){stop.time = +stop.time; return stop}),
                secs: secs
            }
        }
    }

    
    // DRAWING FUNCTIONS
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
    
    function drawTrainsAtTime(unixSeconds, transitionDisabled) {
        // checks time provided, if null takes minimum of day
        if (!unixSeconds) { unixSeconds = global.lastTime; }
        global.lastTime = unixSeconds;
        //unixSeconds = unixSeconds+1000;

        var positionedTrains = getActiveTrainsAtTime(unixSeconds)
            .map(getPositionOfTrain.bind(this, unixSeconds))
            .filter(function(pos){if (pos){return pos}});
        
        var trains = global.svg.selectAll('.train')
            .data(positionedTrains, function (d) { return d.trip; });
        
        var transitionTime = 1000
        trains.enter().append('circle')
            .attr('class', function (d) { return 'train highlightable hoverable dimmable ' + d.line; })
            .classed('active', function (d) { return d.trip === global.highlightedTrip; })
            .classed('hover', function (d) { return d.trip === global.hoveredTrip; })
            .attr('r', 4 )
            .on('click', function (d) { highlightTrain(d); })
            .on('mouseover', hoverTrain)
            .on('mouseout', unHoverAny)
            .style({"fill":"steelblue", "stroke":"white", "stroke-width":"1.5px"})
            .classed("train", true)
            .on("click", function(d){console.log('Trip '+d.trip)});
        
        if (transitionDisabled){
            trains
                .attr('cx', function (d) { return d.atTime.pos[0]; })
                .attr('cy', function (d) { return d.atTime.pos[1]; });
            
            trains.exit().remove();
        }
        else {
            trains
                .transition()
                .duration(transitionTime)
                .attr('cx', function (d) { return d.atTime.pos[0]; })
                .attr('cy', function (d) { return d.atTime.pos[1]; });
        
        trains.exit()
        // first finish till last station then disapear
            .transition().duration(transitionTime/2)
            .attr('cx', function (d) { var coord = stationIdToCoords(d.stops[d.stops.length-1].stop_id); if (coord){return coord.lon;}})
            .attr('cy', function (d) { var coord = stationIdToCoords(d.stops[d.stops.length-1].stop_id); if (coord){return coord.lat;}})
            .style("fill","gray")
            .remove();
        }
        
      }
    
    // POSITION FUNCTIONS
    function networkPreprocessing(){
        /* build array of stations-sections relationships:
        {
            stopId: "stopId",
            linkedSections:["sectionName1", "sectionName2" ... ]
        }
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
    }
    
    function findTrainPath(train){
        /* The goal is to know by which stations/sections a train has passed, even if it doesn't stop at these stations
         it will add for each stop: 
         {
            linkedSections: ["sectionName","sectionName2"..], // section on which the station is located
            nextStopOnSameSection: Boolean,
            followingSections: ["",""] // before joining next stop
         }
         */
        // add linkedSections to each stop,
        train.stops.map(function(stop){
            var correspondingStop = global.stations.find(function(station){return station.stop_id===stop.stop_id;});
            if (!correspondingStop){return;}
            stop.linkedSections = correspondingStop.linkedSections;
        })
        // find path between stations (stop at length-2)
        for (var i=0; i<train.stops.length-1; i++){
            train.stops[i].followingSections=findTweenSections(train.stops[i], train.stops[i+1]);
        }
        // build concatenated path
    }
    
    function computeDistance(){
        
    }
    
    function findTweenSections(previousStation, nextStation){
        /* find shortest path between two stations and returns array of sections passed through
        shortest in terms of length (not in terms of number of stations)
        or for now: shortest in terms of tween nodes
        
        returns object: {
            tweenSections:[],
            pathLength: Number
            }
                
        check if result is cached: array of:
        {
            fromStopId: "",
            toStopId: "",
            result: resultObject
        }
        */
        // check common sections both on previous and next station
        var cached = global.cache.shortestPaths.find(
            function(d){
                return (d.fromStopId===previousStation.stop_id && d.toStopId===nextStation.stop_id);
            }
        )
        if (cached){return cached.result;}

        var common = _.intersection(previousStation.linkedSections, nextStation.linkedSections)
            if (common.length>1){
                // if more than one: error it is not possible
                console.log("Error finding section for stops"+previousStation.stop_id+" and "+nextStation.stop_id)+" common sections are "+common.toString(); return;
            }
            if (common.length===1){
                // if one: easy: that's the following section from stop i
                // returns array of size 1
                var result = {tweenSections: common, pathLength:1};
                global.cache.shortestPaths.push(
                    {
                        fromStopId:previousStation.stop_id, 
                        toStopId: nextStation.stop_id,
                        result: result
                    });
                return result;
            }
            if (common.length===0){
                // if none: stations are not adjacent
                console.log("No common section for stops"+previousStation.stop_id+" and "+nextStation.stop_id);
                // we will then try to find shortest path between endpoints of each stop section (4 points).
                
            }
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
        var ratio = (unixSeconds - from.time) / (to.time - from.time);
        // if (!from || !to || !ratio){console.log("Error for localization: from: "+from+", to: "+to+", ratio: "+ratio); return;}
        var pos = placeWithOffset(from, to, ratio);
        if (!pos){return;}
        train.atTime = {
            time: unixSeconds,
            from: from,
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
    function getActiveTrainsAtTime(unixSeconds){
        // filter active trips: have begun and not finished
        var active = global.trips.filter(function (d) {
          return d.begin < unixSeconds && d.end > unixSeconds;
        });
        
        var finished = global.trips.filter(function (d) {
          return d.end < unixSeconds;
        });
        
        var notYet = global.trips.filter(function (d) {
          return d.begin > unixSeconds;
        });
        console.log("Train positions at time "+unixSeconds+", meaning "+ moment(unixSeconds*1000).format() +". There are at this time "+ active.length +" trains running, "+ finished.length+" train arrived, and "+ notYet.length + " trains not departed yet.")
        
        return active;
    }
    
    function setScale(stations, h, w, border){
        // We save scales in global object for later
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
            drawTrainsAtTime(ui.value, true);
          },
          change: function( event, ui ) {
            drawTrainsAtTime(ui.value);
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
    
    // EXPRESSIONS HERE: before only function statements
    VIZ.requiresData(['json!data/stations.json','json!data/h_sections.json', 'json!data/trips_stops.json'], true)
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
        global.cache.shortestPaths = [];
        
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

        var minUnixSeconds = d3.min(d3.values(trips), function (d) { return d.begin; });
        var maxUnixSeconds = d3.max(d3.values(trips), function (d) { return d.end; });
        renderSlider(minUnixSeconds, maxUnixSeconds)

        
        // Render train dots onto the map glyph at a particular point in time
        global.lastTime = minUnixSeconds;
        
        // Initialization
        global.highlightedTrip = null;
        global.hoveredTrip = null;
        
        // Train display
        console.log("Display of trains at timestamp "+ minUnixSeconds)
        drawTrainsAtTime(minUnixSeconds)
        
        global.timerAdd = 60;
        global.timerDelay = 800;
        setButtonInitialState();
        
        // for tooltip hover
        toolTipInit()
        
        networkPreprocessing();
        
        for (var k=0; k < global.trips.length;k++){
            findTrainPath(global.trips[k]);
        }
        
    
    });
    }(window.H));