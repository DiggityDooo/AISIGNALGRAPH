"use strict";

import { NODE_LABELS, EDGE_LABELS } from "../state/store.js";

function makeCheckbox(label, checked, onChange) {
  const wrapper = document.createElement("label");
  wrapper.className = "hud-check-item";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.append(input, text);
  return wrapper;
}

export function setupFilterControls(state, controller) {
  const { nodeTypeFilters, edgeTypeFilters } = state.refs;
  if (nodeTypeFilters) {
    nodeTypeFilters.innerHTML = "";
    Object.entries(NODE_LABELS).forEach(([type, label]) => {
      nodeTypeFilters.appendChild(makeCheckbox(label, true, (checked) => {
        if (checked) {
          state.activeNodeTypes.add(type);
        } else {
          state.activeNodeTypes.delete(type);
        }
        controller.rebuildFromFilters();
      }));
    });
  }

  if (edgeTypeFilters) {
    edgeTypeFilters.innerHTML = "";
    Object.entries(EDGE_LABELS).forEach(([type, label]) => {
      edgeTypeFilters.appendChild(makeCheckbox(label, true, (checked) => {
        if (checked) {
          state.activeEdgeKinds.add(type);
        } else {
          state.activeEdgeKinds.delete(type);
        }
        controller.rebuildFromFilters();
      }));
    });
  }
}

export function bindUI(state, controller) {
  const refs = state.refs;
  refs.search?.addEventListener("input", () => {
    state.query = refs.search.value.trim().toLowerCase();
    controller.rebuildFromFilters();
  });

  refs.lens?.addEventListener("change", () => {
    state.lens = refs.lens.value;
    controller.rebuildFromFilters();
  });

  refs.sort?.addEventListener("change", () => {
    state.sortMode = refs.sort.value;
    controller.rebuildFromFilters();
  });

  refs.yearFilter?.addEventListener("input", () => {
    state.activeYear = Number.parseInt(refs.yearFilter.value, 10) || state.maxYear;
    refs.yearValue.textContent = String(state.activeYear);
    controller.rebuildFromFilters();
  });

  refs.signalSpeed?.addEventListener("input", () => {
    state.signalSpeed = Number.parseFloat(refs.signalSpeed.value) || 1;
    refs.signalSpeedValue.textContent = `${state.signalSpeed.toFixed(1)}x`;
  });

  refs.simulationToggle?.addEventListener("click", () => {
    if (state.isPaused) {
      controller.resumeSimulation();
    } else {
      controller.pauseSimulation();
    }
  });

  refs.fitButton?.addEventListener("click", () => controller.zoomToFit());
  refs.rebuildButton?.addEventListener("click", () => controller.requestRebuild());

  refs.mode3dToggle?.addEventListener("click", () => {
    controller.set3DMode(!state.is3DMode);
  });

  refs.detailClose?.addEventListener("click", () => controller.clearSelection());

  refs.filtersToggle?.addEventListener("click", () => {
    refs.hudLeft.classList.toggle("is-open");
    refs.filtersToggle.setAttribute("aria-expanded", refs.hudLeft.classList.contains("is-open") ? "true" : "false");
  });

  refs.inspectorToggle?.addEventListener("click", () => {
    refs.hudRight.classList.toggle("is-open");
    refs.inspectorToggle.setAttribute("aria-expanded", refs.hudRight.classList.contains("is-open") ? "true" : "false");
  });

  window.addEventListener("resize", () => controller.onResize());

  if (state.debugMode) {
    window.addEventListener("keydown", (event) => {
      if (event.key === "]") {
        controller.stepSimulation();
      }
    });
  }
}

