(function (global) {
  global.cumulativeSum = function (arr) {
    const builder = function (acc, n) {
      const lastNum = acc.length > 0 ? acc[acc.length - 1] : 0;
      acc.push(lastNum + n);
      return acc;
    };
    return _.reduce(arr, builder, []);
  };

  global.sum = function (arr) {
    return _.reduce(
      arr,
      function (memo, num) {
        return memo + num;
      },
      0
    );
  };

  global.mean = function (arr) {
    const sum = global.sum(arr);
    return sum / arr.length;
  };

  global.weightedMean = function (arrVals, arrWeights) {
    const weightedValues = arrVals.map(function (val, i) {
      return val * arrWeights[i];
    });
    const sum = global.sum(weightedValues);
    const sumWeights = global.sum(arrWeights);
    return sum / sumWeights;
  };

  global.stationsDistance = function (from, to) {
    // scaled because everything is scaled at the beginning
    return Math.sqrt((from.lon - to.lon) ** 2 + (from.lat - to.lat) ** 2);
  };

  function stationWeightedLastDelays(stopId, direction, lastNSeconds) {
    // Not yet implemented, for now random
    return Math.random() * 30;
  }

  // SCALING FUNCTION
  global.setScale = function (stations, h, w, hborder, wborder) {
    // Set scales for GPS coordinates placed on SVG object
    const x = d3.scale
      .linear()
      .domain(
        d3.extent(stations, function (station) {
          return station.lon;
        })
      )
      .range([wborder, w - wborder]);

    const y = d3.scale
      .linear()
      .domain(
        d3.extent(stations, function (station) {
          return station.lat;
        })
      )
      // inverted range because of coordinates inverted
      .range([h - hborder, hborder]);

    return {
      xScale: x,
      yScale: y,
    };
  };
})(window.H);
