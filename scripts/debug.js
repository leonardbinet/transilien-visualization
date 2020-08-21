(function(global) {

    global.tripsWithPassedStations = function() {
        // for troubleshooting, returns list of trips with identified passing stations
        return global.trips.filter(function(trip) {
            // among all stops
            return trip.stops.find(function(stop) {
                // has a non undefined nextPath attribute
                if (!stop.nextPath) { return; }
                if (stop.nextPath.length > 0) { return true; }
            });
        });
    }

    global.tripsWithPrecisePathError = function() {
        // for troubleshooting, returns list of trips with identified passing stations
        var tripsWithErrors = global.trips.filter(function(trip) {
            // that among all stops
            var lastStopId = trip.stops[trip.stops.length - 1].stop_id;
            var hasStopError = trip.stops.find(function(stop) {
                // have a non undefined nextPath attribute (while being a true stop)
                // except last stop that never has nextPath

                return ((!stop.nextPath) && (stop.realStop) && (stop.stop_id !== lastStopId));
            });
            return hasStopError;
        });
        return tripsWithErrors;
    }

    global.activeTripsWithoutPosAtTime = function() {
        // to know which trains haven't been displayed because of errors
        return global.active
            .filter(function(trip) {
                if (!global.positionedTrains.includes(trip)) { return true; }
            });
    }

}(window.H))