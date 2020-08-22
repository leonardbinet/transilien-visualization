(function (global) {
  "use strict";

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

      // compute once color scale instead at each rendering
      global.delayMapColorScale = global.getColorScale();

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
      const scale = global.setScale(
        parsedStations,
        global.h,
        global.w,
        global.hborder,
        global.wborder
      );
      global.xScale = scale.xScale;
      global.yScale = scale.yScale;

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
      // Lasttime init
      state.lastTime = state.minUnixSeconds;
      // Computes data along whole day
      state.activeTrainsData = global.preprocessActiveTrainsPerTime(
        state.minUnixSeconds,
        state.maxUnixSeconds,
        state.trips,
        state.preciseGraph
      );

      // RENDERING SLIDERS AND TIMERS
      // Timer button
      global.setButtonInitialState(state);
      global.renderTimeSlider(
        state.minUnixSeconds,
        state.maxUnixSeconds,
        state
      );
      global.renderSpeedSlider(state);
      global.renderTimerDelaySlider(state);

      // Generates chart
      global.generateActiveTrainsChart(
        "#stacked-area-chart-active-trains",
        state.activeTrainsData
      );

      //// DRAWING STATIONS AND SECTIONS
      // Tooltip hover over Map of trains and stations
      global.toolTipInit();
      global.drawSections(state.sections);
      global.drawInitialSubsectionsJam(state.sections, state);
      global.drawStationsNames(state.stations);
      global.drawStations(state, state.stations);
    });
})(window.H);
