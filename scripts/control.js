import { renderAllAtTime } from "./render.js";
import { smoothness } from "./constant.js";

function sliderTimeUpdate(state, event, ui) {
  $("#slider-title").text(
    moment(ui.value * 1000).format("MMMM Do YYYY, h:mm:ss a")
  );

  renderAllAtTime(ui.value, true, state.displayScheduled, state);
  state.lastTime = ui.value;
}

export function renderTimeSlider(min, max, state) {
  $("#slider").slider({
    step: 2,
    orientation: "horizontal",
    animate: "slow",
    value: min + (max - min) / 4,
    min: min,
    max: max,
    create: function (event, ui) {
      $("#slider-title").text(
        moment((min + (max - min) / 4) * 1000).format("MMMM Do YYYY, h:mm:ss a")
      );
    },
    slide: sliderTimeUpdate.bind(this, state),
    change: sliderTimeUpdate.bind(this, state),
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

export function setButtonInitialState(state) {
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

export function renderSpeedSlider(state) {
  $("#speed").slider({
    orientation: "horizontal",
    animate: "slow",
    value: state.timeSpeed,
    min: 0,
    max: 500,
    create: function (event, ui) {
      $("#speed-value").text(state.timeSpeed);
    },
    slide: function (event, ui) {
      $("#speed-value").text(ui.value);
      state.timeSpeed = ui.value;
      recomputeTiming(state);
    },
  });
}

export function renderTimerDelaySlider(state) {
  $("#timer-delay").slider({
    orientation: "horizontal",
    animate: "slow",
    value: state.timerDelay,
    min: 15,
    max: 150,
    create: function (event, ui) {
      $("#timer-delay-value").text(state.timerDelay);
    },
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
  state.transitionTime = state.timerDelay * smoothness;
}
