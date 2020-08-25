import { generateActiveTrainsChart } from "./activeTrainsChart.js";
import {
  setButtonInitialState,
  renderSpeedSlider,
  renderTimerDelaySlider,
  renderTimeSlider,
} from "./control.js";
import { initDatatable } from "./tables.js";
import { drawInitialSubsectionsJam } from "./sectionJam.js";
import {
  parseStation,
  parseSection,
  parseTrip,
  preprocessTrainPathWithTime,
  preprocessActiveTrainsPerTime,
} from "./parsing.js";
import { setScale } from "./math.js";
import { drawStationsNames, drawStations, drawSections } from "./render.js";
import {
  width,
  height,
  hborder,
  wborder,
  smoothness,
  svgSelector,
} from "./constant.js";
import { Graph, graphPreprocessing, SectionManager } from "./graph.js";
import { requiresData } from "./dataloader.js";

("use strict");

requiresData(
  [
    "json!data/clean_data/stations.json",
    "json!data/clean_data/h_sections.json",
    "json!data/clean_data/trains.json",
  ],
  true
).done(function (stations, sections, rawTrips) {
  const state = {};

  state.timeSpeed = 150; // time real time x N
  state.timerDelay = 50; // new update every n milliseconds
  state.timerAdd = (state.timerDelay * state.timeSpeed) / 1000; // will add n seconds at each iteration
  // Transition time (shouldn't be much bigger than timerDelay)
  state.transitionTime = state.timerDelay * smoothness;

  //// INIT

  // Init map svg
  d3.select(svgSelector)
    .style("width", width + "px")
    .style("height", height + "px")
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
  initDatatable();

  //// DATA IMPORT, PARSING, SCALING OF STATIONS
  // Stations are imported before because their coordinates are used for scaling, and then used to compute
  // sections coordinates.
  const parsedStations = stations.map(parseStation).filter(function (station) {
    if (station) {
      return station;
    }
  });
  // Compute svg scale given stations positions
  const scale = setScale(parsedStations, height, width, hborder, wborder);

  // Rescale coordinates of all stations
  state.stations = parsedStations.map(function (station) {
    station.lon = scale.xScale(station.lon);
    station.lat = scale.yScale(station.lat);
    return station;
  });

  //// DATA IMPORT, PARSING OF SECTIONS AND TRIPS
  // Sections
  state.sections = sections.map(parseSection.bind(this, state.stations));
  // Graph preprocessing (to then find trains shortest paths between stations)
  // create graph of all stations and sections
  state.preciseGraph = new Graph();
  graphPreprocessing(state.preciseGraph, state.sections);
  state.sectionManager = new SectionManager(state.sections);

  // Trains
  state.trips = rawTrips
    .map(parseTrip.bind(this, state.stations))
    .filter(function (trip) {
      if (trip) {
        return trip;
      }
    });
  // Find train shortest paths and estimate time with delay
  state.trips.forEach(
    preprocessTrainPathWithTime.bind(this, state.preciseGraph, state.stations)
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
  state.activeTrainsData = preprocessActiveTrainsPerTime(
    state.minUnixSeconds,
    state.maxUnixSeconds,
    state.trips,
    state.preciseGraph
  );

  // RENDERING SLIDERS AND TIMERS
  // Timer button
  setButtonInitialState(state);
  renderTimeSlider(state.minUnixSeconds, state.maxUnixSeconds, state);
  renderSpeedSlider(state);
  renderTimerDelaySlider(state);

  // Generates chart
  generateActiveTrainsChart(
    "#stacked-area-chart-active-trains",
    state.activeTrainsData
  );

  //// DRAWING STATIONS AND SECTIONS
  // Tooltip hover over Map of trains and stations

  drawSections(state.sections);
  drawInitialSubsectionsJam(state.sections, state);
  drawStationsNames(state.stations);
  drawStations(state, state.stations);
});
