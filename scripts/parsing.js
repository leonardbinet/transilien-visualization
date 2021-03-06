import { isActiveObserved } from "./common.js";
import { setTrainsPositions } from "./render.js";
import { line } from "./constant.js";
import { stationsDistance, cumulativeSum } from "./math.js";

export function preprocessTrainPathWithTime(graph, stations, train) {
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
    const fromStop = train.stops[i];
    const toStop = train.stops[i + 1];

    // Find path between two consecutive stops
    fromStop.nextPath = graph
      .shortestPath(fromStop.stop.stop_id, toStop.stop.stop_id)
      .map(stopIdToStop.bind(this, stations));

    // If no station passed without stop, or error trying to find: finished
    if (!fromStop.nextPath) {
      continue;
    }
    if (fromStop.nextPath.length === 0) {
      continue;
    }

    // Else find time spent between stops
    fromStop.sectionTimeSecs = toStop.scheduledTime - fromStop.scheduledTime;

    // Find total distance between stops
    // Sum of all subsections, and list of subsections distances
    var totalDistance = 0;
    const distancesList = [];
    // add beginning and end
    const iniDist = stationsDistance(fromStop.stop, fromStop.nextPath[0]);
    totalDistance += iniDist;
    distancesList.push(iniDist);
    const endDist = stationsDistance(
      toStop.stop,
      fromStop.nextPath[fromStop.nextPath.length - 1]
    );
    totalDistance += endDist;
    // distancesList.push(endDist);
    for (var m = 0; m < fromStop.nextPath.length - 1; m++) {
      const subsectionDistance = stationsDistance(
        fromStop.nextPath[m],
        fromStop.nextPath[m + 1]
      );
      distancesList.push(subsectionDistance);
      totalDistance += subsectionDistance;
    }
    // Assign "distanceTillNextStop" to train's last stop
    fromStop.distanceTillNextStop = totalDistance;

    // Assign ratio of distance for each subsection to train's last stop
    fromStop.ratioList = cumulativeSum(
      distancesList.map(function (d) {
        return d / totalDistance;
      })
    );
    // assign spent time to ...
    const timeList = fromStop.ratioList.map(function (r) {
      return r * fromStop.sectionTimeSecs;
    });
    // and finally assign Timestamp: seconds + initial timestamp to ...
    fromStop.timestampList = timeList.map(function (t) {
      return t + fromStop.scheduledTime;
    });
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
  const guessedStops = [];
  train.stops.forEach(function (stop) {
    // find guessed passed stations
    // if not found stop
    if (!stop.nextPath) {
      return;
    }

    for (var h = 0; h < stop.nextPath.length; h++) {
      guessedStops.push({
        stop: stop.nextPath[h],
        scheduledTime: stop.timestampList[h],
        realStop: false,
      });
    }
  });
  train.stops = train.stops.concat(guessedStops);
  // Order stop by time (necessary for positioning functions)
  train.stops = _.sortBy(train.stops, function (o) {
    return o.scheduledTime;
  });

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
      train.stops[0].estimatedTime =
        train.stops[0].scheduledTime + train.stops[0].estimatedDelay;
      continue;
    }
    // estimatedDelay is this stop delay, or if not exists estimatedDelay of previous stop
    train.stops[j].estimatedDelay =
      train.stops[j].delay || train.stops[j - 1].estimatedDelay;
    train.stops[j].estimatedTime =
      train.stops[j].scheduledTime + train.stops[j].estimatedDelay;
  }

  // Find begining and end based on observed times
  // ObservedBegin, ObservedEnd
  train.ObservedBegin = _.min(train.stops, function (stop) {
    return stop.estimatedTime;
  }).estimatedTime;
  train.ObservedEnd = _.max(train.stops, function (stop) {
    return stop.estimatedTime;
  }).estimatedTime;
}

export function preprocessActiveTrainsPerTime(
  minUnixSeconds,
  maxUnixSeconds,
  trips,
  graph
) {
  /* returns in following format: array of:
        {
            date: timestamp,
            total: NbOfActiveTrains,
            meanDelay: meanDelay
        }
        
        */
  const activeTrainsData = [];
  for (
    var unixSeconds = minUnixSeconds;
    unixSeconds < maxUnixSeconds;
    unixSeconds += 600
  ) {
    const active = trips.filter(isActiveObserved.bind(this, unixSeconds));

    active
      .map(setTrainsPositions.bind(this, unixSeconds, graph))
      .filter(function (train) {
        if (!train) {
          return;
        }
      });

    const meanDelay =
      _.reduce(
        active.map(function (trip) {
          return trip.atTime.observed.estimatedDelay;
        }),
        function (memo, num) {
          return memo + num;
        },
        0
      ) / active.length;

    activeTrainsData.push({
      date: unixSeconds * 1000,
      total: active.length,
      meanDelay: meanDelay,
    });
  }
  return activeTrainsData;
}

export function stopIdToStop(stations, stopId) {
  const stop = stations.find(function (stop) {
    return stop.stop_id === stopId;
  });
  // if (!stop) {
  //     // adds stop_id to errors stops, and associate it with trip_id
  //     if (errors.notFoundStops[stopId] === undefined) {
  //         errors.notFoundStops[stopId] = [];
  //         console.log("Added " + stopId + " to stop_ids without found station.")
  //     }
  // }
  return stop;
}

export function parseStation(d, i) {
  // returns only for given line
  if (d[line]) {
    return {
      uic8: d.Code_UIC,
      uic7: d.UIC7,
      stop_id: d.stop_id,
      lat: +d.stop_lat,
      lon: +d.stop_lon,
      name: d.stop_name,
      linkedSections: [],
      linkedSubSections: [],
    };
  }
}

export function parseSection(stations, d, i) {
  // Extract stop_ids (we don't keep names, they are useful for conception/debugging only)
  var points = d.points.map(function (o) {
    return Object.keys(o)[0];
  });
  // Replace by real stations objects
  points = points.map(stopIdToStop.bind(this, stations));
  const endPoints = [points[0], points[points.length - 1]];
  const subsections = [];
  for (var p = 0; p < points.length - 1; p++) {
    const subsection = {
      from: points[p],
      to: points[p + 1],
      name: points[p].name + " -> " + points[p + 1].name,
      distance: stationsDistance(points[p], points[p + 1]),
      atTime: {
        renderedAtTime: null,
        observed: {
          // at current time
          dir0: [],
          dir1: [],
          // with some cached from last minutes
          cachedDir0: [],
          cachedDir1: [],
        },
        scheduled: {
          // at current time
          dir0: [],
          dir1: [],
          // with some cached from last minutes
          cachedDir0: [],
          cachedDir1: [],
        },
      },
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
    pointsCoord: points.map(function (station) {
      return {
        lon: station.lon,
        lat: station.lat,
      };
    }),
  };
}

export function parseTrip(stations, d, i) {
  // if >10000, it is an error of date parsing
  const secs = +d.end - +d.begin;
  if (secs > 10000) {
    return;
  }

  var stops = d.stops.map(function (stop) {
    const fullStop = {};
    // checks if stop_id is among imported stations
    const realStop = stopIdToStop(stations, stop.stop_id);
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

  stops = stops.filter(function (stop) {
    return !!stop;
  });
  if (stops.length < 2) {
    console.log(
      "Added " +
        d.trip +
        " to trips with errors (less than 2 stations identified)."
    );
    return;
  }
  return {
    begin: +d.begin,
    end: +d.end,
    line: d.line,
    trip: d.trip,
    stops: stops,
    secs: secs,
  };
}

export function parseDatatableTrain(type, train) {
  // type is either "observed" or "scheduled"
  // Subsection name
  const cfrom = train.atTime[type].from.name;
  const cto = train.atTime[type].to.name;
  const subsection = cfrom + " -> " + cto;

  // From
  const from = train.stops[0].stop.name;
  // To
  const to = train.stops[train.stops.length - 1].stop.name;

  const estimatedDelay = Math.floor(train.atTime[type].estimatedDelay);
  if ("undefined" === typeof estimatedDelay) {
    estimatedDelay = "nan";
  }

  return {
    trip: train.trip,
    estimatedDelay: estimatedDelay,
    from: from,
    to: to,
    subsection: subsection,
  };
}
