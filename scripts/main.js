(function (global) {
  "use strict";
  /*
    TODO: detail main steps
    */

  // PATH VIZ
  // STATIONS OBSERVED DELAYS
  function stationWeightedLastDelays(stopId, direction, lastNSeconds) {
    // Not yet implemented, for now random
    return Math.random() * 30;
  }

  // SCALING FUNCTION
  function setScale(stations, h, w, hborder, wborder) {
    // Set scales for GPS coordinates placed on SVG object
    var x = d3.scale
      .linear()
      .domain(
        d3.extent(stations, function (station) {
          return station.lon;
        })
      )
      .range([wborder, w - wborder]);
    global.xScale = x;

    var y = d3.scale
      .linear()
      .domain(
        d3.extent(stations, function (station) {
          return station.lat;
        })
      )
      // inverted range because of coordinates inverted
      .range([h - hborder, hborder]);
    global.yScale = y;
  }

  // HOVER HIGHLIGHT FUNCTIONS
  /*
    For trains: 
    - one tooltip, text, position and opacity according to hovered train
    */
  function toolTipInit() {
    // Define the div for the tooltip
    d3.select("body")
      .append("div")
      .attr("class", "tooltip")
      .attr("id", global.toolTipId)
      .style("opacity", 0);
  }

  // COLOR
  global.delayMapColorScale = d3.scale
    .linear()
    .interpolate(d3.interpolateLab)
    .domain([-300, 60, 600])
    .range(["rgb(0, 104, 55)", "rgb(255, 255, 255)", "rgb(165, 0, 38)"]);

  // SLIDER AND TIMER FUNCTIONS
  function renderTimeSlider(min, max, state) {
    $("#slider").slider({
      step: 2,
      orientation: "horizontal",
      animate: "slow",
      value: min + 18000,
      min: min,
      max: max,
      slide: function (event, ui) {
        $("#slider-text").text(
          moment(ui.value * 1000).format("MMMM Do YYYY, h:mm:ss a")
        );
        $("#slider-title").text(
          moment(ui.value * 1000).format("MMMM Do YYYY, h:mm:ss a")
        );

        global.renderAllAtTime(ui.value, true, state.displayScheduled, state);
        state.lastTime = ui.value;
      },
      change: function (event, ui) {
        $("#slider-text").text(
          moment(ui.value * 1000).format("MMMM Do YYYY, h:mm:ss a")
        );
        $("#slider-title").text(
          moment(ui.value * 1000).format("MMMM Do YYYY, h:mm:ss a")
        );

        global.renderAllAtTime(ui.value, false, state.displayScheduled, state);
        state.lastTime = ui.value;
      },
    });
  }

  function sliderTimerUpdate(state) {
    // set value
    // previous time
    const previous = $("#slider").slider("option", "value");

    $("#slider").slider("value", previous + state.timerAdd);
    if (state.timerActivated) {
      setTimeout(sliderTimerUpdate, state.timerDelay, state);
    }
  }

  function setButtonInitialState(state) {
    // Timer button
    $("#button").on("click", function () {
      state.timerActivated = !state.timerActivated;
      sliderTimerUpdate(state);
      if (state.timerActivated) {
        $("#button").text("Stop");
      } else {
        $("#button").text("Start");
      }
    });
    // Scheduled button
    $("#scheduled")
      .closest("label")
      .on("click", function () {
        console.log("Display Schedule");
        state.displayScheduled = 1;
        state.displayObserved = 0;
      });
    // Observed button
    $("#observed")
      .closest("label")
      .on("click", function () {
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
      slide: function (event, ui) {
        $("#speed-value").text(ui.value);
        state.timeSpeed = ui.value;
        recomputeTiming(state);
      },
    });
  }

  function renderTimerDelaySlider(state) {
    $("#timer-delay").slider({
      orientation: "horizontal",
      animate: "slow",
      value: state.timerDelay,
      min: 15,
      max: 150,
      slide: function (event, ui) {
        $("#timer-delay-value").text(ui.value);
        state.timerDelay = ui.value;
        recomputeTiming(state);
      },
    });
  }

  function recomputeTiming(state) {
    state.timerAdd = (state.timerDelay * state.timeSpeed) / 1000; // will add n seconds at each iteration
    // Transition time (shouldn't be much bigger than timerDelay)
    state.transitionTime = state.timerDelay * global.smoothness;
  }

  // EXPRESSIONS HERE: before only function statements
  global
    .requiresData(
      [
        "json!data/clean_data/stations.json",
        "json!data/clean_data/h_sections.json",
        "json!data/clean_data/trains.json",
      ],
      true
    )
    .done(function (stations, sections, rawTrips) {
      const state = global.state;

      state.timeSpeed = 150; // time real time x N
      state.timerDelay = 50; // new update every n milliseconds
      state.timerAdd = (state.timerDelay * state.timeSpeed) / 1000; // will add n seconds at each iteration
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
      const parsedStations = stations
        .map(global.parseStation)
        .filter(function (station) {
          if (station) {
            return station;
          }
        });
      // Compute svg scale given stations positions
      setScale(
        parsedStations,
        global.h,
        global.w,
        global.hborder,
        global.wborder
      );
      // Rescale coordinates of all stations
      state.stations = parsedStations.map(function (station) {
        station.lon = global.xScale(station.lon);
        station.lat = global.yScale(station.lat);
        return station;
      });

      //// DATA IMPORT, PARSING OF SECTIONS AND TRIPS
      // Sections
      state.sections = sections.map(
        global.parseSection.bind(this, state.stations)
      );
      // Graph preprocessing (to then find trains shortest paths between stations)
      // create graph of all stations and sections
      state.preciseGraph = new global.Graph();
      global.graphPreprocessing(state.preciseGraph, state.sections);
      state.sectionManager = new global.SectionManager(state.sections);

      // Trains
      state.trips = rawTrips
        .map(global.parseTrip.bind(this, state.stations))
        .filter(function (trip) {
          if (trip) {
            return trip;
          }
        });
      // Find train shortest paths and estimate time with delay
      state.trips.forEach(
        global.preprocessTrainPathWithTime.bind(
          this,
          state.preciseGraph,
          state.stations
        )
      );

      // Finding trains range of dates
      state.minUnixSeconds = d3.min(d3.values(state.trips), function (d) {
        return d.begin;
      });
      state.maxUnixSeconds = d3.max(d3.values(state.trips), function (d) {
        return d.end;
      });

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
      state.activeTrainsData = global.preprocessActiveTrainsPerTime(
        state.minUnixSeconds,
        state.maxUnixSeconds,
        state.trips,
        state.preciseGraph
      );

      // Generates chart
      global.generateActiveTrainsChart(
        "#stacked-area-chart-active-trains",
        state.activeTrainsData
      );

      //// DRAWING STATIONS AND SECTIONS
      // Sections
      global.drawSections(state.sections);

      // Tooltip hover over Map of trains and stations
      toolTipInit();

      // Draw subsection jams
      global.drawInitialSubsectionsJam(state.sections, state);
      global.drawStationsNames(state.stations);

      // Draw stations
      global.drawStations(state, state.stations);
    });
})(window.H);
