(function (global) {
  global.cumulativeSum = function (arr) {
    var builder = function (acc, n) {
      var lastNum = acc.length > 0 ? acc[acc.length - 1] : 0;
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
    var sum = global.sum(arr);
    return sum / arr.length;
  };

  global.weightedMean = function (arrVals, arrWeights) {
    var weightedValues = arrVals.map(function (val, i) {
      return val * arrWeights[i];
    });
    var sum = global.sum(weightedValues);
    var sumWeights = global.sum(arrWeights);
    return sum / sumWeights;
  };

  global.stationsDistance = function (from, to) {
    // scaled because everything is scaled at the beginning
    var distance = Math.sqrt(
      (from.lon - to.lon) ** 2 + (from.lat - to.lat) ** 2
    );
    return distance;
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
