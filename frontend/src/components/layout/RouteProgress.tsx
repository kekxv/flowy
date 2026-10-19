import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  beginRouteProgress, completeRouteProgress, subscribeRouteProgress,
} from "../../utils/routeProgress";

/**
 * Thin top progress bar for route transitions.
 *
 * Starts on link clicks (before React Router's transition commits) and finishes
 * when the route content has rendered.
 */
export default function RouteProgress() {
  const location = useLocation();
  const [state, setState] = useState({ active: false, value: 0 });

  useEffect(() => subscribeRouteProgress(setState), []);

  // Start early: a capture-phase click on an internal link.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      const external = anchor.getAttribute("target") === "_blank" || /^(https?:)?\/\//.test(href);
      if (external || !(href.startsWith("#/") || href.startsWith("/"))) return;
      const before = window.location.hash;
      beginRouteProgress();
      // If the click did not actually navigate (same route), drop the bar again.
      setTimeout(() => {
        if (window.location.hash === before) completeRouteProgress();
      }, 60);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Finish once the new route has rendered.
  useEffect(() => {
    completeRouteProgress();
  }, [location.key]);

  // Dim the page slightly when a transition takes longer than a blink, so it
  // never looks frozen while the next chunk loads.
  useEffect(() => {
    const root = document.documentElement;
    if (!state.active) {
      root.removeAttribute("data-navigating");
      return;
    }
    const timer = setTimeout(() => root.setAttribute("data-navigating", "true"), 220);
    return () => {
      clearTimeout(timer);
      root.removeAttribute("data-navigating");
    };
  }, [state.active]);

  return (
    <div
      className="route-progress"
      data-active={state.active ? "true" : "false"}
      style={{ width: `${state.value}%` }}
      aria-hidden="true"
    />
  );
}
