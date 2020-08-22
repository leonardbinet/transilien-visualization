(function(global) {
    "use strict";
    /*
    TODO: detail main steps
    */

    // DRAWING FUNCTIONS
    function renderAllAtTime(unixSeconds, transitionDisabled, displayScheduled, state) {

        /* Find all active, notYet, and finished trains:
        - either based on schedule
        - either based on observations
        */

        var type; // two options: either scheduled, or observed

        // checks time and transition time

        if (displayScheduled) {
            state.active = state.trips.filter(function(d) {
                return global.isActiveScheduled(unixSeconds, d);
            });

            state.finished = state.trips.filter(function(d) {
                return (d.end < unixSeconds);
            });

            state.notYet = state.trips.filter(function(d) {
                return (d.begin > unixSeconds);
            });

            type = "scheduled";

        } else {
            state.active = state.trips.filter(function(d) {
                return global.isActiveObserved(unixSeconds, d);
            });

            state.finished = state.trips.filter(function(d) {
                return (d.ObservedEnd < unixSeconds);
            });

            state.notYet = state.trips.filter(function(d) {
                return (d.ObservedBegin > unixSeconds);
            });

            type = "observed";

        }

        // FIND TRAINS POSITIONS
        state.positionedTrains = state.active
            .map(setTrainsPositions.bind(this, unixSeconds, state.preciseGraph))
            .filter(function(train) {
                if (!train) { return; }
                if (train.atTime.scheduled.pos && train.atTime.scheduled.acceptedEdge && state.displayScheduled) { return train; }
                if (train.atTime.observed.pos && train.atTime.observed.acceptedEdge && state.displayObserved) { return train; }
            });

        infoPanel(state);

        drawTrainsAtTime(unixSeconds, transitionDisabled, state.transitionTime, state.positionedTrains, state.displayObserved, state.highlightedTrip, state.hoveredTrip, state);

        // Compute and render delays evolution
        state.sectionManager.refreshAtTime(unixSeconds, state.positionedTrains, state.lastTime);
        global.renderJam(transitionDisabled, state);

        // Table of active trains
        const activeDatatableFormat = state.active.map(global.parseDatatableTrain.bind(this, type));
        global.updateTableData(activeDatatableFormat);

    }


    function drawTrainsAtTime(unixSeconds, transitionDisabled, transitionTime, positionedTrains, displayObserved, highlightedTrip, hoveredTrip, state) {

        if (transitionDisabled) { transitionTime = 0; }

        // DISPLAY TRAINS
        var trainsGroups = d3.select("#map-svg").selectAll('.train')
            .data(positionedTrains, function(d) { return d.trip; });

        if (displayObserved) {
            // OBSERVED

            // Update
            trainsGroups
                .transition()
                .duration(transitionTime)
                .attr('cx', function(d) { return d.atTime.observed.pos[0]; })
                .attr('cy', function(d) { return d.atTime.observed.pos[1]; })
                .attr("fill", function(d) { return global.delayMapColorScale(d.atTime.observed.estimatedDelay); })
                .attr("r", global.mapGlyphTrainCircleRadius - 0.5)
                .attr("opacity", displayObserved)

            // Enter
            trainsGroups.enter().append('circle')
                .attr('class', function(d) { return 'highlightable hoverable dimmable ' + d.line; })
                .classed('active', function(d) { return d.trip === highlightedTrip; })
                .classed('hover', function(d) { return d.trip === hoveredTrip; })
                .classed("train", true)
                .classed("observed", true)
                .on('mouseover', hoverTrain.bind(this, state))
                .on('mouseout', unHoverTrain.bind(this, state))
                .on("click", function(d) {
                    console.log(d);
                    console.log("observed")
                })
                .attr("r", 2)
                .attr("opacity", displayObserved)
                .attr("fill", "lightgreen")
                .attr('cx', function(d) { return d.stops[0].stop.lon; })
                .attr('cy', function(d) { return d.stops[0].stop.lat; });

        } else {
            // SCHEDULE
            // Update
            trainsGroups
                .transition()
                .duration(transitionTime)
                .attr('cx', function(d) { return d.atTime.scheduled.pos[0]; })
                .attr('cy', function(d) { return d.atTime.scheduled.pos[1]; })
                .attr("fill", "steelblue")
                .attr("r", global.mapGlyphTrainCircleRadius - 0.5)
                .attr("opacity", displayScheduled)

            // Enter
            trainsGroups.enter().append('circle')
                .attr('class', function(d) { return 'highlightable hoverable dimmable ' + d.line; })
                .classed('active', function(d) { return d.trip === highlightedTrip; })
                .classed('hover', function(d) { return d.trip === hoveredTrip; })
                .classed("train", true)
                .classed("scheduled", true)
                .on('mouseover', hoverTrain.bind(this, state))
                .on('mouseout', unHoverTrain.bind(this, state))
                .on("click", function(d) {
                    console.log(d);
                    console.log("scheduled")
                })
                .attr("r", 2)
                .attr("opacity", displayScheduled)
                .attr("fill", "lightgreen")
                .attr('cx', function(d) { return d.stops[0].stop.lon; })
                .attr('cy', function(d) { return d.stops[0].stop.lat; });
        }

        // Exit
        trainsGroups.exit()
            .transition()
            .duration(transitionTime)
            // first finish till last station then disapear
            .attr('cx', function(d) { return d.stops[d.stops.length - 1].stop.lon; })
            .attr('cy', function(d) { return d.stops[d.stops.length - 1].stop.lat; })
            .attr("fill", "grey")
            .attr("r", 3)
            .remove()
    }

    function drawStationsNames(stations) {
        d3.select(global.svgSelector).selectAll("station-name")
            .data(stations)
            .enter()
            .append("text")
            .classed("station-name", true)
            .attr("opacity", function(d) { return global.visibleStations.find(function(st) { return st.id === d.stop_id }) ? 1 : 0; })
            .text(function(d) { return d.name })
            .attr("id", function(d) { return d.stop_id.slice(10); })
            .attr("text-anchor", function(d) {
                var station = global.visibleStations.find(function(st) { return st.id === d.stop_id });
                var reverse;
                if (station) { reverse = station.reverse; }
                return reverse ? "end" : "start";
            })
            .attr("transform", function(d) {
                var station = global.visibleStations.find(function(st) { return st.id === d.stop_id });
                var reverse;
                if (station) { reverse = station.reverse; }
                var offset = reverse ? -5 : 5;
                return "translate(" + (d.lon + offset) + "," + d.lat + ") rotate(-15)"
            })
    }


    function preprocessTrainPathWithTime(graph, stations, train) {
        /* The goal is to find (station, time) of all stations for which the train doesn't stop.
        
        A- Find passed stations without stop
        The first part is to know by which stations a train has passed, even if it doesn't stop at these stations
        it will add for each station the shortest path to the next station (array of stations at which it doesn't stop).
        {nextStations = []}
        
        B- Guess at what time the train will pass them
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
        
        C- Build concatenated path
        */

        for (var i = 0; i < train.stops.length - 1; i++) {
            var fromStop = train.stops[i];
            var toStop = train.stops[i + 1];

            // Find path between two consecutive stops
            fromStop.nextPath = graph.shortestPath(fromStop.stop.stop_id, toStop.stop.stop_id)
                .map(global.stopIdToStop.bind(this, stations));

            // If no station passed without stop, or error trying to find: finished
            if (!fromStop.nextPath) { continue; }
            if (fromStop.nextPath.length === 0) { continue; }

            // Else find time spent between stops
            fromStop.sectionTimeSecs = toStop.scheduledTime - fromStop.scheduledTime;

            // Find total distance between stops
            // Sum of all subsections, and list of subsections distances
            var totalDistance = 0;
            var distancesList = [];
            // add beginning and end
            var iniDist = global.stationsDistance(fromStop.stop, fromStop.nextPath[0]);
            totalDistance += iniDist
            distancesList.push(iniDist);
            var endDist = global.stationsDistance(toStop.stop, fromStop.nextPath[fromStop.nextPath.length - 1]);
            totalDistance += endDist;
            // distancesList.push(endDist);
            for (var m = 0; m < fromStop.nextPath.length - 1; m++) {
                var subsectionDistance = global.stationsDistance(fromStop.nextPath[m], fromStop.nextPath[m + 1]);
                distancesList.push(subsectionDistance);
                totalDistance += subsectionDistance;
            }
            // Assign "distanceTillNextStop" to train's last stop
            fromStop.distanceTillNextStop = totalDistance;

            // Assign ratio of distance for each subsection to train's last stop
            fromStop.ratioList = global.cumulativeSum(distancesList.map(function(d) { return d / totalDistance; }));
            // assign spent time to ...
            var timeList = fromStop.ratioList.map(function(r) { return r * fromStop.sectionTimeSecs; })
                // and finally assign Timestamp: seconds + initial timestamp to ...
            fromStop.timestampList = timeList.map(function(t) { return t + fromStop.scheduledTime; })

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
        train.stops.forEach(function(stop) {
            // find guessed passed stations
            // if not found stop
            if (!stop.nextPath) { return; }

            for (var h = 0; h < stop.nextPath.length; h++) {
                var g = {
                    stop: stop.nextPath[h],
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
        for (var j = 0; j < train.stops.length; j++) {
            if (j === 0) {
                train.stops[0].estimatedDelay = train.stops[0].delay || 0;
                train.stops[0].estimatedTime = train.stops[0].scheduledTime + train.stops[0].estimatedDelay;
                continue;
            }
            // estimatedDelay is this stop delay, or if not exists estimatedDelay of previous stop
            train.stops[j].estimatedDelay = train.stops[j].delay || train.stops[j - 1].estimatedDelay;
            train.stops[j].estimatedTime = train.stops[j].scheduledTime + train.stops[j].estimatedDelay;
        }

        // Find begining and end based on observed times
        // ObservedBegin, ObservedEnd
        train.ObservedBegin = _.min(train.stops, function(stop) { return stop.estimatedTime }).estimatedTime;
        train.ObservedEnd = _.max(train.stops, function(stop) { return stop.estimatedTime }).estimatedTime;

    }

    function setTrainsPositions(unixSeconds, graph, train) {
        /*
        Find positions based on schedule and based on observations.
        TODO: take into account if real stops or not for timing.
        */

        // SCHEDULED
        // Find which is last passed station
        for (var i = 0; i < train.stops.length - 1; i++) {
            if (train.stops[i + 1].scheduledTime > unixSeconds) { break; }
        }
        var sfrom = train.stops[i];
        var sto = train.stops[i + 1];
        var sacceptedEdge, sratio, spos, sfromStop, stoStop;

        if (sfrom && sto) {
            sfromStop = sfrom.stop;
            stoStop = sto.stop;
            // Check if real edge of precise graph
            sacceptedEdge = graph.isEdge(sfromStop.stop_id, stoStop.stop_id);
            // Find ratio
            sratio = (unixSeconds - sfrom.scheduledTime) / (sto.scheduledTime - sfrom.scheduledTime);
            // Compute position object given: from, to and ratio
            spos = placeWithOffset(sfromStop, stoStop, sratio);

        }

        const scheduled = {
            from: sfromStop,
            to: stoStop,
            timeRatio: sratio,
            pos: spos,
            acceptedEdge: sacceptedEdge
        };

        // OBSERVED (with extrapolation when no data is found)
        for (var j = 0; j < train.stops.length - 1; j++) {
            if (train.stops[j + 1].estimatedTime > unixSeconds) { break; }
        }

        var efrom = train.stops[j];
        var eto = train.stops[j + 1];
        var eacceptedEdge, eratio, epos, previousEstimatedDelay, nextEstimatedDelay, estimatedDelayEvolution, estimatedDelay, efromStop, etoStop;

        if (efrom && eto) {
            // Check if real edge of precise graph
            eacceptedEdge = graph.isEdge(efrom.stop.stop_id, eto.stop.stop_id);
            // Find ratio
            eratio = (unixSeconds - efrom.estimatedTime) / (eto.estimatedTime - efrom.estimatedTime);
            // compute position object given: from, to and ratio
            epos = placeWithOffset(efrom.stop, eto.stop, eratio);

            previousEstimatedDelay = efrom.estimatedDelay;
            nextEstimatedDelay = eto.estimatedDelay;

            estimatedDelayEvolution = nextEstimatedDelay - previousEstimatedDelay;
            estimatedDelay = eratio * nextEstimatedDelay + (1 - eratio) * previousEstimatedDelay;

            efromStop = efrom.stop;
            etoStop = eto.stop;
        }

        const observed = {
            from: efromStop,
            to: etoStop,
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
            observed: observed
        };
        return train;
    }

    function placeWithOffset(from, to, ratio) {

        // extrapolate position from trip ratio, previous station, and next station
        var fromPos = { lon: from.lon, lat: from.lat };
        var toPos = { lon: to.lon, lat: to.lat };

        var midpoint = d3.interpolate([fromPos.lon, fromPos.lat], [toPos.lon, toPos.lat])(ratio);
        var angle = Math.atan2(toPos.lat - fromPos.lat, toPos.lon - fromPos.lon) + Math.PI / 2;
        return [midpoint[0] + Math.cos(angle) * global.mapGlyphTrainCircleRadius, midpoint[1] + Math.sin(angle) * global.mapGlyphTrainCircleRadius];
    }

    // PATH VIZ
    // STATIONS OBSERVED DELAYS 
    function stationWeightedLastDelays(stopId, direction, lastNSeconds) {
        // Not yet implemented, for now random
        return Math.random() * 30;
    }

    // SCALING FUNCTION
    function setScale(stations, h, w, hborder, wborder) {
        // Set scales for GPS coordinates placed on SVG object
        var x = d3.scale.linear()
            .domain(d3.extent(stations, function(station) { return station.lon; }))
            .range([wborder, w - wborder]);
        global.xScale = x;

        var y = d3.scale.linear()
            .domain(d3.extent(stations, function(station) { return station.lat; }))
            // inverted range because of coordinates inverted
            .range([(h - hborder), hborder]);
        global.yScale = y;
    }

    // HOVER HIGHLIGHT FUNCTIONS
    /*
    For trains: 
    - one tooltip, text, position and opacity according to hovered train
    */
    function toolTipInit() {
        // Define the div for the tooltip
        d3.select("body").append("div")
            .attr("class", "tooltip")
            .attr("id", global.toolTipId)
            .style("opacity", 0);
    }

    function hoverTrain(state, d) {
        // set hoveredTrip: only one at a time
        state.hoveredTrip = d.trip;

        // update tooltip
        d3.select(global.toolTipSelector)
            .style("left", (d3.event.pageX + 8) + "px")
            .style("top", (d3.event.pageY - 28) + "px")
            .transition()
            .duration(200)
            .style("opacity", .7)
            .text("Train " + d.trip + " currently going from station " +
                d.atTime.observed.from.name + " to station " + d.atTime.observed.to.name +
                ", has an estimated delay of " + d.atTime.observed.estimatedDelay + " seconds."
            );
    }

    function unHoverTrain(state) {
        // set hovered trip as null
        state.hoveredTrip = null;
        // update tootlip
        d3.select(global.toolTipSelector)
            .transition()
            .duration(500)
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

    // INFO PANEL
    function infoPanel(state) {
        $("#nbNotYetTrains").text(state.notYet.length);
        $("#nbActiveTrains").text(state.active.length);
        $("#nbFinishedTrains").text(state.finished.length);
        $("#nbDisplayError").text(state.active.length - state.positionedTrains.length);
    }

    // COLOR
    global.delayMapColorScale = d3.scale.linear()
        .interpolate(d3.interpolateLab)
        .domain([-300, 60, 600])
        .range(['rgb(0, 104, 55)', 'rgb(255, 255, 255)', 'rgb(165, 0, 38)']);

    // SLIDER AND TIMER FUNCTIONS
    function renderTimeSlider(min, max, state) {
        $("#slider").slider({
            step: 2,
            orientation: "horizontal",
            animate: "slow",
            value: min + 18000,
            min: min,
            max: max,
            slide: function(event, ui) {
                $("#slider-text").text(moment(ui.value * 1000).format("MMMM Do YYYY, h:mm:ss a"));
                $("#slider-title").text(moment(ui.value * 1000).format("MMMM Do YYYY, h:mm:ss a"));

                renderAllAtTime(ui.value, true, state.displayScheduled, state);
                state.lastTime = ui.value;
            },
            change: function(event, ui) {
                $("#slider-text").text(moment(ui.value * 1000).format("MMMM Do YYYY, h:mm:ss a"));
                $("#slider-title").text(moment(ui.value * 1000).format("MMMM Do YYYY, h:mm:ss a"));

                renderAllAtTime(ui.value, false, state.displayScheduled, state);
                state.lastTime = ui.value;
            }
        });
    }

    function sliderTimerUpdate(state) {
        // set value
        // previous time
        const previous = $("#slider").slider("option", "value");

        $("#slider").slider('value', previous + state.timerAdd);
        if (state.timerActivated) {
            setTimeout(sliderTimerUpdate, state.timerDelay, state);
        }
    }

    function setButtonInitialState(state) {
        // Timer button
        $("#button").on("click", function() {
            state.timerActivated = !state.timerActivated;
            sliderTimerUpdate(state);
            if (state.timerActivated) { $("#button").text("Stop"); } else { $("#button").text("Start"); }
        });
        // Scheduled button
        $("#scheduled").closest('label').on("click", function() {
            console.log("Display Schedule");
            state.displayScheduled = 1;
            state.displayObserved = 0;

        });
        // Observed button
        $("#observed").closest('label').on("click", function() {
            console.log("Display Observed");
            state.displayObserved = 1;
            state.displayScheduled = 0;

        });
    }

    function renderSpeedSlider(state) {
        $("#speed").slider({
            orientation: "horizontal",
            animate: "slow",
            value: state.timeSpeed,
            min: 0,
            max: 500,
            slide: function(event, ui) {
                $("#speed-value").text(ui.value);
                state.timeSpeed = ui.value;
                recomputeTiming(state);
            }
        });
    }

    function renderTimerDelaySlider(state) {
        $("#timer-delay").slider({
            orientation: "horizontal",
            animate: "slow",
            value: state.timerDelay,
            min: 15,
            max: 150,
            slide: function(event, ui) {
                $("#timer-delay-value").text(ui.value);
                state.timerDelay = ui.value;
                recomputeTiming(state);
            }
        });
    }

    function recomputeTiming(state) {
        state.timerAdd = state.timerDelay * state.timeSpeed / 1000; // will add n seconds at each iteration
        // Transition time (shouldn't be much bigger than timerDelay)
        state.transitionTime = state.timerDelay * global.smoothness;
    }

    global.preprocessActiveTrainsPerTime = function(minUnixSeconds, maxUnixSeconds, trips, graph) {
        /* returns in following format: array of:
        {
            date: timestamp,
            total: NbOfActiveTrains,
            meanDelay: meanDelay
        }
        
        */
        const activeTrainsData = [];
        for (var unixSeconds = minUnixSeconds; unixSeconds < maxUnixSeconds; unixSeconds += 600) {
            const active = trips.filter(global.isActiveObserved.bind(this, unixSeconds));

            active.map(setTrainsPositions.bind(this, unixSeconds, graph))
                .filter(function(train) {
                    if (!train) { return; }
                });

            const meanDelay = _.reduce(active.map(function(trip) { return trip.atTime.observed.estimatedDelay; }), function(memo, num) { return memo + num; }, 0) / active.length;

            activeTrainsData.push({
                date: unixSeconds * 1000,
                total: active.length,
                meanDelay: meanDelay
            });
        }
        return activeTrainsData
    }


    // EXPRESSIONS HERE: before only function statements
    global.requiresData(['json!data/clean_data/stations.json', 'json!data/clean_data/h_sections.json', 'json!data/clean_data/trains.json'], true)
        .done(function(stations, sections, rawTrips) {

            const state = global.state

            state.timeSpeed = 150; // time real time x N
            state.timerDelay = 50; // new update every n milliseconds
            state.timerAdd = state.timerDelay * state.timeSpeed / 1000; // will add n seconds at each iteration
            // Transition time (shouldn't be much bigger than timerDelay)
            state.transitionTime = state.timerDelay * global.smoothness;

            //// INIT
            // Init map svg
            d3.select("#map")
                .append("svg")
                .attr("width", global.w)
                .attr("height", global.h)
                .attr("id", global.svgId)
                .classed("center-block", true);

            // init cache results
            state.cache = {};
            state.cache.stationsDistances = [];
            state.errors = {};
            state.errors.notFoundStops = {};
            state.errors.stopNoCoords = [];
            state.errors.stopNoNeighboor = [];

            // Highlight and hover init
            state.highlightedTrip = null;
            state.hoveredTrip = null;

            // Scheduled or observed
            state.displayScheduled = 0;
            state.displayObserved = 1;

            // Generates initial table
            global.initDatatable();

            //// DATA IMPORT, PARSING, SCALING OF STATIONS
            // Stations are imported before because their coordinates are used for scaling, and then used to compute
            // sections coordinates.
            const parsedStations = stations.map(global.parseStation).filter(function(station) { if (station) { return station } });
            // Compute svg scale given stations positions
            setScale(parsedStations, global.h, global.w, global.hborder, global.wborder)
                // Rescale coordinates of all stations
            state.stations = parsedStations.map(function(station) {
                station.lon = global.xScale(station.lon);
                station.lat = global.yScale(station.lat);
                return station;
            });

            //// DATA IMPORT, PARSING OF SECTIONS AND TRIPS
            // Sections
            state.sections = sections.map(global.parseSection.bind(this, state.stations));
            // Graph preprocessing (to then find trains shortest paths between stations)
            // create graph of all stations and sections
            state.preciseGraph = new global.Graph();
            global.graphPreprocessing(state.preciseGraph, state.sections);
            state.sectionManager = new global.SectionManager(state.sections);

            // Trains
            state.trips = rawTrips.map(global.parseTrip.bind(this, state.stations)).filter(function(trip) { if (trip) { return trip } });
            // Find train shortest paths and estimate time with delay
            state.trips.forEach(preprocessTrainPathWithTime.bind(this, state.preciseGraph, state.stations));

            // Finding trains range of dates
            state.minUnixSeconds = d3.min(d3.values(state.trips), function(d) { return d.begin; });
            state.maxUnixSeconds = d3.max(d3.values(state.trips), function(d) { return d.end; });


            // RENDERING SLIDERS AND TIMERS
            // Timer button
            setButtonInitialState(state);
            // Lasttime init
            state.lastTime = state.minUnixSeconds;
            // Slider init
            renderTimeSlider(state.minUnixSeconds, state.maxUnixSeconds, state);
            // Speed slider
            renderSpeedSlider(state);
            // TimerDelay slider
            renderTimerDelaySlider(state);


            // CHART - ACTIVE TRAINS
            // Computes data along whole day
            state.activeTrainsData = global.preprocessActiveTrainsPerTime(state.minUnixSeconds, state.maxUnixSeconds, state.trips, state.preciseGraph);

            // Generates chart
            global.generateActiveTrainsChart('#stacked-area-chart-active-trains', state.activeTrainsData);


            //// DRAWING STATIONS AND SECTIONS
            // Sections
            global.drawSections(state.sections);

            // Tooltip hover over Map of trains and stations
            toolTipInit();

            // Draw subsection jams
            global.drawInitialSubsectionsJam(state.sections, state);
            drawStationsNames(state.stations);

            // Draw stations
            global.drawStations(state, state.stations);

        });
}(window.H));