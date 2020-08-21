(function(global) {
    global.stopIdToStop = function(stations, stopId) {
        const stop = stations.find(function(stop) { return stop.stop_id === stopId; });
        // if (!stop) {
        //     // adds stop_id to errors stops, and associate it with trip_id
        //     if (errors.notFoundStops[stopId] === undefined) {
        //         errors.notFoundStops[stopId] = [];
        //         console.log("Added " + stopId + " to stop_ids without found station.")
        //     }
        // }
        return stop;
    };

    global.parseStation = function(d, i) {
        // returns only for given line
        if (d[global.line]) {
            return {
                uic8: d.Code_UIC,
                uic7: d.UIC7,
                stop_id: d.stop_id,
                lat: +d.stop_lat,
                lon: +d.stop_lon,
                name: d.stop_name,
                linkedSections: [],
                linkedSubSections: []
            }
        }
    }

    global.parseSection = function(stations, d, i) {
        // Extract stop_ids (we don't keep names, they are useful for conception/debugging only)
        var points = d.points.map(function(o) { return Object.keys(o)[0] });
        // Replace by real stations objects
        var points = points.map(global.stopIdToStop.bind(this, stations));
        var endPoints = [points[0], points[points.length - 1]];
        var subsections = [];
        for (var p = 0; p < points.length - 1; p++) {
            var subsection = {
                from: points[p],
                to: points[p + 1],
                name: points[p].name + " -> " + points[p + 1].name,
                distance: global.stationsDistance(points[p], points[p + 1]),
                atTime: {
                    renderedAtTime: null,
                    observed: {
                        // at current time
                        dir0: [],
                        dir1: [],
                        // with some cached from last minutes
                        cachedDir0: [],
                        cachedDir1: []
                    },
                    scheduled: {
                        // at current time
                        dir0: [],
                        dir1: [],
                        // with some cached from last minutes
                        cachedDir0: [],
                        cachedDir1: []
                    }
                }
            };
            subsections.push(subsection);
        }
        return {
            name: d.name,
            endPoints: endPoints,
            points: points,
            subsections: subsections,
            nbStations: points.length,
            // returns {lon:, lat:}
            pointsCoord: points.map(function(station) {
                return {
                    lon: station.lon,
                    lat: station.lat
                };
            })
        };
    }

    global.parseTrip = function(stations, d, i) {
        // if >10000, it is an error of date parsing
        var secs = +d.end - +d.begin;
        if (secs > 10000) { return; }

        var stops = d.stops.map(function(stop) {
            var fullStop = {};
            // checks if stop_id is among imported stations
            var realStop = global.stopIdToStop(stations, stop.stop_id);
            if (!realStop) {
                // if not stop is ignored and trip is added to errors
                // state.errors.notFoundStops[stop.stop_id].push(d);
                return;
            }
            fullStop.stop = realStop;
            fullStop.scheduledTime = +stop.time;
            if (stop.delay) {
                fullStop.delay = +stop.delay;
                // if error of one day
                fullStop.delay = fullStop.delay % 86400;
                if (fullStop.delay > 5000) {
                    console.log("Info: delay>5000 secs observed: " + fullStop.delay);
                }
            }
            fullStop.realStop = true;
            return fullStop;
        });

        stops = stops.filter(function(stop) { return !!stop; })
        if (stops.length < 2) {
            console.log("Added " + d.trip + " to trips with errors (less than 2 stations identified).");
            return;
        }
        return {
            begin: +d.begin,
            end: +d.end,
            line: d.line,
            trip: d.trip,
            stops: stops,
            secs: secs
        }
    }

    global.parseDatatableTrain = function(type, train) {
        // type is either "observed" or "scheduled"
        // Subsection name
        var cfrom = train.atTime[type].from.name;
        var cto = train.atTime[type].to.name;
        var subsection = cfrom + " -> " + cto;

        // From
        var from = train.stops[0].stop.name;
        // To
        var to = train.stops[train.stops.length - 1].stop.name;

        var estimatedDelay = Math.floor(train.atTime[type].estimatedDelay);
        if ("undefined" === typeof estimatedDelay) { estimatedDelay = "nan" }

        return {
            trip: train.trip,
            estimatedDelay: estimatedDelay,
            from: from,
            to: to,
            subsection: subsection
        };
    }

}(window.H))