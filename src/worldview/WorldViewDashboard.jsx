import { CctvOverlay } from './components/CctvOverlay.jsx';
import { ControlPanel } from './components/ControlPanel.jsx';
import { EventDetailPanel } from './components/EventDetailPanel.jsx';
import { EventsPanel } from './components/EventsPanel.jsx';
import { GlobeContainer } from './components/GlobeContainer.jsx';
import { HudHeader } from './components/HudHeader.jsx';
import { StatusBar } from './components/StatusBar.jsx';
import { TooltipOverlay } from './components/TooltipOverlay.jsx';
import { useWorldViewApp } from './hooks/useWorldViewApp.js';
import './style.css';

export function WorldViewDashboard() {
  useWorldViewApp();

  return (
    <>
      <HudHeader />
      <ControlPanel />
      <EventsPanel />
      <EventDetailPanel />
      <div className="alert-toast-wrap" id="alert-toast-wrap"></div>
      <GlobeContainer />
      <TooltipOverlay />
      <CctvOverlay />
      <StatusBar />
    </>
  );
}
