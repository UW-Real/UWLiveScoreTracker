"use client";

import { useRef, useState } from "react";
import ScoresSection from "@/components/ScoresSection";

// A tab per sport, with that sport's scores below. Follows the WAI-ARIA tabs
// pattern: only the selected tab is in the Tab order, and the arrow keys and
// Home/End move between tabs.
export default function SportTabs({ sports, scoresBySport = {}, emptyMessages = {} }) {
  const [selectedId, setSelectedId] = useState(sports[0].id);
  const tabRefs = useRef({});

  const selectedSport = sports.find((sport) => sport.id === selectedId);

  function selectTab(index) {
    const sport = sports[index];
    setSelectedId(sport.id);
    tabRefs.current[sport.id]?.focus();
    // There are ~20 tabs, so the tab bar scrolls; keep the selected one visible.
    tabRefs.current[sport.id]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function handleKeyDown(event) {
    const currentIndex = sports.findIndex((sport) => sport.id === selectedId);
    const lastIndex = sports.length - 1;
    const nextIndex = {
      ArrowRight: currentIndex === lastIndex ? 0 : currentIndex + 1,
      ArrowLeft: currentIndex === 0 ? lastIndex : currentIndex - 1,
      Home: 0,
      End: lastIndex,
    }[event.key];

    if (nextIndex !== undefined) {
      event.preventDefault();
      selectTab(nextIndex);
    }
  }

  return (
    <div className="sport-tabs">
      <div
        className="sport-tab-list"
        role="tablist"
        aria-label="Sports"
        onKeyDown={handleKeyDown}
      >
        {sports.map((sport) => {
          const isSelected = sport.id === selectedId;
          return (
            <button
              key={sport.id}
              ref={(element) => { tabRefs.current[sport.id] = element; }}
              id={`tab-${sport.id}`}
              className="sport-tab"
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`panel-${sport.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelectedId(sport.id)}
            >
              {sport.name}
            </button>
          );
        })}
      </div>

      <div
        id={`panel-${selectedSport.id}`}
        className="sport-panel"
        role="tabpanel"
        aria-labelledby={`tab-${selectedSport.id}`}
        // The panel is usually just text, so make it focusable for keyboard users.
        tabIndex={0}
      >
        <h2 className="sport-panel-title">{selectedSport.name}</h2>
        <ScoresSection
          sportName={selectedSport.name}
          games={scoresBySport[selectedSport.id]}
          emptyMessage={emptyMessages[selectedSport.id]}
        />
      </div>
    </div>
  );
}
