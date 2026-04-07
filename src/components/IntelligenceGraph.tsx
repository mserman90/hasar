import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import cytoscape from 'cytoscape';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Globe, 
  Activity, 
  Rss, 
  Database, 
  AlertTriangle, 
  X, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp,
  Info,
  RefreshCw,
  Satellite,
  Zap
} from 'lucide-react';
import { cn } from '../lib/utils';
import { IntelligenceEvent, IntelligenceEntity, IntelligenceEntityNode } from '../types';

interface IntelligenceGraphProps {
  events: IntelligenceEvent[];
  onRefresh: () => void;
  isRefreshing: boolean;
}

const SHAPES: Record<string, string> = {
  osint: 'ellipse',
  earthquake: 'ellipse',
  flight: 'ellipse',
  disaster: 'ellipse',
  space_weather: 'ellipse',
  satellite_monitoring: 'round-rectangle',
  regional_threat: 'pentagon',
  cve: 'diamond',
  apt: 'hexagon',
  location: 'triangle',
  category: 'round-rectangle',
  anomaly: 'star'
};

const COLORS: Record<string, string> = {
  osint: '#94a3b8',
  earthquake: '#f97316',
  flight: '#06b6d4',
  disaster: '#f43f5e',
  space_weather: '#facc15',
  satellite_monitoring: '#14b8a6',
  regional_threat: '#f97316',
  cve: '#ef4444',
  apt: '#a855f7',
  location: '#3b82f6',
  category: '#10b981',
  anomaly: '#e11d48'
};

export default function IntelligenceGraph({ events, onRefresh, isRefreshing }: IntelligenceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['🚨 AI Anomalileri', '💻 Siber Güvenlik Olayları', '🌍 Fiziksel Güvenlik Olayları']));
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number; visible: boolean }>({ text: '', x: 0, y: 0, visible: false });

  const slugify = (text: string) => text.toString().toLowerCase().trim().replace(/[\s\W-]+/g, '-');

  const entitiesMap = useMemo(() => {
    const map = new Map<string, IntelligenceEntityNode>();
    events.forEach(ev => {
      ev.entities.forEach(ent => {
        const entId = `ent_${ent.type}_${slugify(ent.label)}`;
        if (!map.has(entId)) {
          map.set(entId, { id: entId, label: ent.label, type: ent.type, count: 0 });
        }
        const node = map.get(entId)!;
        node.count++;
      });
    });
    return map;
  }, [events]);

  const groupedEntities = useMemo(() => {
    const groups: Record<string, IntelligenceEntityNode[]> = {};
    entitiesMap.forEach(ent => {
      let group = '📁 Diğer';
      const label = ent.label.toLowerCase();
      const type = ent.type;

      if (type === 'anomaly') group = '🚨 AI Anomalileri';
      else if (type === 'cve' || type === 'apt' || ['malware', 'cyber', 'ransomware', 'hack', 'breach', 'phishing', 'siber', 'zafiyet', 'güvenlik'].some(tag => label.includes(tag))) {
        group = '💻 Siber Güvenlik Olayları';
      } else if (type === 'location' || ['earthquake', 'flood', 'tsunami', 'volcano', 'sismik', 'uzay hava', 'afet', 'disaster', 'flight', 'havacılık', 'uydu'].some(tag => label.includes(tag))) {
        group = '🌍 Fiziksel Güvenlik Olayları';
      } else if (type === 'category') group = '🟢 Etiketler';

      if (!groups[group]) groups[group] = [];
      groups[group].push(ent);
    });
    
    // Sort within groups
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => b.count - a.count);
    });
    
    return groups;
  }, [entitiesMap]);

  const initGraph = useCallback(() => {
    if (!containerRef.current || cyRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'font-size': '8px',
            'color': '#94a3b8',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-background-color': '#020617',
            'text-background-opacity': 0.7,
            'text-background-padding': '2px',
            'width': 12,
            'height': 12,
            'background-color': '#e2e8f0',
            'border-width': 1,
            'border-color': '#0f172a',
            'transition-property': 'background-color, border-color, width, height, opacity',
            'transition-duration': 300
          }
        },
        ...Object.entries(SHAPES).map(([type, shape]) => ({
          selector: `node[nodeType = "${type}"]`,
          style: {
            'shape': shape as any,
            'background-color': COLORS[type],
            'border-color': COLORS[type],
            'width': type === 'anomaly' || type === 'apt' ? 24 : 16,
            'height': type === 'anomaly' || type === 'apt' ? 24 : 16,
          }
        })),
        {
          selector: 'node[?isAnomaly], node[nodeType = "regional_threat"], node[nodeType = "cve"], node[nodeType = "apt"], .critical',
          style: {
            'width': 32,
            'height': 32,
            'border-width': 2,
            'border-color': '#ffffff',
            'underlay-color': '#f43f5e',
            'underlay-padding': '12px',
            'underlay-opacity': 0.5,
            'font-weight': 'bold',
            'font-size': '10px',
            'color': '#ffffff',
            'text-outline-width': 1,
            'text-outline-color': '#020617',
            'z-index': 100
          }
        },
        {
          selector: '.pulse',
          style: {
            'underlay-padding': '20px',
            'underlay-opacity': 0.2,
            'transition-property': 'underlay-padding, underlay-opacity',
            'transition-duration': 1000
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': '#334155',
            'opacity': 0.4,
            'curve-style': 'bezier',
            'transition-property': 'opacity, line-color, width',
            'transition-duration': 300
          }
        },
        {
          selector: 'edge.critical',
          style: {
            'width': 2,
            'line-color': '#f43f5e',
            'opacity': 0.6
          }
        },
        {
          selector: ':selected',
          style: {
            'border-width': 4,
            'border-color': '#f59e0b',
            'width': 30,
            'height': 30
          }
        },
        {
          selector: '.faded',
          style: {
            'opacity': 0.1,
            'text-opacity': 0
          }
        },
        {
          selector: '.new-node',
          style: {
            'underlay-color': '#10b981',
            'underlay-padding': '12px',
            'underlay-opacity': 0.5
          }
        }
      ],
      layout: { name: 'null' }
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      setSelectedNode(node.data('fullData'));
      setIsDetailOpen(true);
    });

    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const type = node.data('nodeType');
      if (['osint', 'earthquake', 'flight', 'disaster', 'space_weather', 'satellite_monitoring', 'regional_threat'].includes(type)) {
        const pos = node.renderedPosition();
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (containerRect) {
          setTooltip({
            text: node.data('label'),
            x: containerRect.left + pos.x,
            y: containerRect.top + pos.y,
            visible: true
          });
        }
      }
    });

    cy.on('mouseout', 'node', () => {
      setTooltip(prev => ({ ...prev, visible: false }));
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setIsDetailOpen(false);
      }
    });

    cyRef.current = cy;
  }, []);

  // Update elements incrementally
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    const currentElementIds = new Set(cy.elements().map(el => el.id()));
    const newElements: cytoscape.ElementDefinition[] = [];
    const addedEdges = new Set<string>();

    // Process Events
    events.forEach(ev => {
      if (!currentElementIds.has(ev.id)) {
        const isCritical = ev.isAnomaly || ev.type === 'regional_threat' || (ev.type === 'earthquake' && (ev.mag || 0) >= 6.0);
        newElements.push({
          data: { 
            id: ev.id, 
            label: ev.title, 
            nodeType: ev.type, 
            isAnomaly: ev.isAnomaly,
            fullData: ev
          },
          classes: isCritical ? 'critical new-node' : 'new-node'
        });
      }

      ev.entities.forEach(ent => {
        const entId = `ent_${ent.type}_${slugify(ent.label)}`;
        const edgeId = `edge_${ev.id}_${entId}`;
        
        if (!currentElementIds.has(edgeId) && !addedEdges.has(edgeId)) {
          addedEdges.add(edgeId);
          const isEdgeCritical = ev.isAnomaly || ev.type === 'regional_threat' || (ev.type === 'earthquake' && (ev.mag || 0) >= 6.0) || ent.type === 'anomaly' || ent.type === 'cve' || ent.type === 'apt';
          newElements.push({
            data: { id: edgeId, source: ev.id, target: entId },
            classes: isEdgeCritical ? 'critical' : ''
          });
        }
      });
    });

    // Process Entities
    entitiesMap.forEach(ent => {
      if (!currentElementIds.has(ent.id)) {
        const isCritical = ent.type === 'anomaly' || ent.type === 'cve' || ent.type === 'apt';
        newElements.push({
          data: { 
            id: ent.id, 
            label: ent.label, 
            nodeType: ent.type,
            fullData: ent
          },
          classes: isCritical ? 'critical new-node' : 'new-node'
        });
      }
    });

    // Remove elements that are no longer present
    const incomingIds = new Set([
      ...events.map(e => e.id),
      ...Array.from(entitiesMap.keys()),
      ...events.flatMap(e => e.entities.map(ent => `edge_${e.id}_ent_${ent.type}_${slugify(ent.label)}`))
    ]);

    const toRemove = cy.elements().filter(el => !incomingIds.has(el.id()));
    if (toRemove.length > 0) {
      toRemove.remove();
    }

    if (newElements.length > 0) {
      const added = cy.add(newElements);
      
      // Run layout for new elements
      const layout = cy.layout({
        name: 'cose',
        animate: true,
        animationDuration: 1000,
        randomize: false,
        fit: true,
        padding: 50,
        idealEdgeLength: 100,
        nodeRepulsion: 8000,
        stop: () => {
          // Remove 'new-node' class after animation
          setTimeout(() => {
            added.removeClass('new-node');
          }, 2000);
        }
      } as any);
      
      layout.run();
    }
  }, [events, entitiesMap, slugify]);

  // Pulse animation loop for critical nodes
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    const pulseInterval = setInterval(() => {
      const criticalNodes = cy.nodes().filter(n => 
        n.data('isAnomaly') || 
        ['regional_threat', 'cve', 'apt'].includes(n.data('nodeType')) ||
        (n.data('nodeType') === 'earthquake' && n.data('fullData')?.mag >= 6.0)
      );
      
      criticalNodes.toggleClass('pulse');
    }, 1000);

    return () => clearInterval(pulseInterval);
  }, [events]);

  useEffect(() => {
    initGraph();
    
    const handleResize = () => {
      if (cyRef.current) {
        cyRef.current.resize();
        cyRef.current.fit(undefined, 50);
      }
    };

    window.addEventListener('resize', handleResize);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsDetailOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [initGraph]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const filterByEntity = (entId: string) => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    
    cy.elements().stop(true, true);
    cy.elements().addClass('faded').style({ opacity: 0.1 });
    
    const node = cy.getElementById(entId);
    if (node.length > 0) {
      const connected = node.closedNeighborhood();
      connected.removeClass('faded').style({ opacity: 1 });
      cy.animate({ fit: { eles: connected, padding: 40 }, duration: 500 });
      setSelectedNode(entitiesMap.get(entId));
      setIsDetailOpen(true);
    }
  };

  const resetFilter = () => {
    if (!cyRef.current) return;
    cyRef.current.elements().removeClass('faded').style({ opacity: 1 });
    cyRef.current.fit(undefined, 50);
    setIsDetailOpen(false);
  };

  const getRelatedAnomalies = (node: any) => {
    if (!node) return [];
    
    // If it's an entity node (has type property)
    if (node.type) {
      return events.filter(e => 
        e.isAnomaly && 
        e.entities.some(ent => ent.label === node.label && ent.type === node.type)
      ).sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
    } 
    
    // If it's an event node (has fullData property)
    const eventData = node.fullData || node;
    return events.filter(e =>
      e.isAnomaly && 
      e.id !== eventData.id &&
      (
        // Share same location
        e.entities.some(ent1 => 
          ent1.type === 'location' && 
          eventData.entities.some((ent2: any) => ent2.type === 'location' && ent1.label === ent2.label)
        ) ||
        // Share same threat actor
        e.entities.some(ent1 => 
          ent1.type === 'apt' && 
          eventData.entities.some((ent2: any) => ent2.type === 'apt' && ent1.label === ent2.label)
        ) ||
        // Share same category
        e.entities.some(ent1 => 
          ent1.type === 'category' && 
          eventData.entities.some((ent2: any) => ent2.type === 'category' && ent1.label === ent2.label)
        )
      )
    ).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  };

  const getConnectedNodes = (node: any) => {
    if (!node) return [];
    if (node.type) {
      // Entity node -> return connected events
      return events.filter(e => 
        e.entities.some(ent => ent.label === node.label && ent.type === node.type)
      ).sort((a, b) => b.timestamp - a.timestamp).slice(0, 15);
    } else {
      // Event node -> return connected entities
      const eventData = node.fullData || node;
      return eventData.entities || [];
    }
  };

  const relatedAnomalies = useMemo(() => getRelatedAnomalies(selectedNode), [selectedNode, events]);
  const connectedNodes = useMemo(() => getConnectedNodes(selectedNode), [selectedNode, events]);

  return (
    <div className="flex h-full w-full bg-[#020617] relative overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r border-slate-800 flex flex-col bg-[#020617]/80 backdrop-blur z-10">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
            <Zap className="w-4 h-4" /> GÖZCÜ İSTİHBARAT
          </h2>
          <button 
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 transition disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <button 
            onClick={resetFilter}
            className="w-full py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded hover:bg-emerald-500/20 transition"
          >
            AĞI SIFIRLA
          </button>

          {Object.entries(groupedEntities).map(([groupName, entities]) => (
            <div key={groupName} className="border border-slate-800 rounded-lg overflow-hidden">
              <button 
                onClick={() => toggleGroup(groupName)}
                className="w-full px-3 py-2 flex items-center justify-between bg-slate-900/50 hover:bg-slate-800 transition text-[10px] font-bold text-slate-300"
              >
                <span>{groupName}</span>
                <div className="flex items-center gap-2">
                  <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[8px]">{(entities as IntelligenceEntityNode[]).length}</span>
                  {expandedGroups.has(groupName) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </div>
              </button>
              
              <AnimatePresence>
                {expandedGroups.has(groupName) && (
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden bg-black/20"
                  >
                    <div className="p-2 flex flex-col gap-1">
                      {(entities as IntelligenceEntityNode[]).map(ent => (
                        <button
                          key={ent.id}
                          onClick={() => filterByEntity(ent.id)}
                          className={cn(
                            "flex items-center justify-between px-2 py-1.5 rounded text-[10px] hover:bg-slate-800 transition group",
                            ent.type === 'anomaly' ? "text-rose-400" : "text-slate-400"
                          )}
                        >
                          <span className="truncate">{ent.label}</span>
                          <span className="bg-slate-900 px-1.5 py-0.5 rounded text-[8px] group-hover:bg-emerald-500/20 group-hover:text-emerald-400 transition">{ent.count}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      {/* Graph Area */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="w-full h-full" />
        
        {/* Tooltip */}
        <AnimatePresence>
          {tooltip.visible && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ left: tooltip.x, top: tooltip.y }}
              className="fixed z-[100] pointer-events-none px-3 py-1.5 bg-slate-900/95 text-white text-[10px] rounded-lg border border-slate-700 shadow-xl backdrop-blur-sm -translate-x-1/2 -translate-y-[150%] whitespace-nowrap"
            >
              {tooltip.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Legend Overlay */}
        <div className="absolute bottom-4 left-4 p-3 glass rounded-lg border border-slate-800 text-[9px] text-slate-400 grid grid-cols-2 gap-x-4 gap-y-1 pointer-events-none">
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-400" /> OSINT</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500" /> Deprem</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded bg-teal-500" /> Uydu</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-yellow-400" /> Uzay</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 bg-red-500 rotate-45" /> Zafiyet</div>
          <div className="flex items-center gap-2"><div className="w-2 h-2 bg-purple-500" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }} /> Aktör</div>
          <div className="flex items-center gap-2 col-span-2 text-rose-400 font-bold"><div className="w-3 h-3 bg-rose-500" style={{ clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' }} /> AI ANOMALİSİ</div>
        </div>
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {isDetailOpen && selectedNode && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDetailOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-[420px] bg-[#020617] border-l border-slate-800 z-50 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)]"
            >
              {/* Dossier Header */}
              <div className="relative h-32 bg-slate-900 overflow-hidden shrink-0">
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/20 via-transparent to-transparent" />
                  <div className="h-full w-full bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:20px_20px]" />
                </div>
                
                <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-[#020617] to-transparent">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg border",
                        selectedNode.isAnomaly || selectedNode.type === 'anomaly' 
                          ? "bg-rose-500/20 border-rose-500/40 text-rose-400" 
                          : "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                      )}>
                        {selectedNode.type === 'anomaly' || selectedNode.isAnomaly ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">İSTİHBARAT DOSYASI</div>
                        <div className="text-[9px] text-slate-600 font-mono mt-0.5">REF: {selectedNode.id.toUpperCase()}</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsDetailOpen(false)}
                      className="p-2 hover:bg-white/5 rounded-full text-slate-500 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {selectedNode.type ? (
                  /* Entity Detail View */
                  <div className="space-y-8">
                    <section>
                      <h2 className="text-2xl font-bold text-white tracking-tight leading-none">{selectedNode.label}</h2>
                      <div className="flex items-center gap-3 mt-3">
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] font-bold rounded uppercase tracking-wider border border-slate-700">
                          {selectedNode.type}
                        </span>
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Activity className="w-3 h-3" /> {selectedNode.count} Bağlantılı Olay
                        </span>
                      </div>
                    </section>

                    <section className="space-y-3">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Globe className="w-3 h-3" /> BAĞLANTILI OLAYLAR
                      </h4>
                      <div className="space-y-2">
                        {connectedNodes.map((ev: any) => (
                          <button 
                            key={ev.id}
                            onClick={() => {
                              setSelectedNode(ev);
                              // Highlight in graph if possible
                              if (cyRef.current) {
                                cyRef.current.elements().removeClass('faded').style({ opacity: 1 });
                                const node = cyRef.current.getElementById(ev.id);
                                if (node.length > 0) {
                                  cyRef.current.animate({ fit: { eles: node, padding: 100 }, duration: 500 });
                                  node.select();
                                }
                              }
                            }}
                            className="w-full text-left p-3 bg-slate-900/40 border border-slate-800 rounded-lg hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <span className="text-[11px] text-slate-200 font-medium line-clamp-1 group-hover:text-emerald-400 transition-colors">{ev.title}</span>
                              <span className="text-[8px] text-slate-600 font-mono shrink-0">{new Date(ev.timestamp).toLocaleDateString('tr-TR')}</span>
                            </div>
                            {ev.isAnomaly && (
                              <div className="mt-1 flex items-center gap-1 text-[8px] text-rose-400 font-bold uppercase">
                                <Zap className="w-2 h-2" /> Anomali Tespit Edildi
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </section>

                    {relatedAnomalies.length > 0 && (
                      <section className="space-y-3">
                        <h4 className="text-[10px] font-bold text-rose-500 uppercase tracking-widest flex items-center gap-2">
                          <AlertTriangle className="w-3 h-3" /> KRİTİK ANOMALİLER
                        </h4>
                        <div className="space-y-2">
                          {relatedAnomalies.map(a => (
                            <div key={a.id} className="p-4 bg-rose-500/5 border border-rose-500/20 rounded-lg space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-[9px] text-rose-400 font-bold">{new Date(a.timestamp).toLocaleString('tr-TR')}</span>
                                <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-400 text-[8px] font-bold rounded">YÜKSEK RİSK</span>
                              </div>
                              <div className="text-xs text-white font-bold leading-tight">{a.title}</div>
                              <p className="text-[10px] text-slate-400 leading-relaxed italic">"{a.anomalyReason}"</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                ) : (
                  /* Event Detail View */
                  <div className="space-y-8">
                    <section>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={cn(
                          "px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider border",
                          selectedNode.fullData.isAnomaly ? "bg-rose-500/20 border-rose-500/30 text-rose-400" : "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                        )}>
                          {selectedNode.nodeType.replace('_', ' ')}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">
                          {new Date(selectedNode.fullData.timestamp).toLocaleString('tr-TR')}
                        </span>
                      </div>
                      <h2 className="text-xl font-bold text-white tracking-tight leading-snug">{selectedNode.label}</h2>
                    </section>

                    {selectedNode.fullData.isAnomaly && (
                      <section className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-10">
                          <AlertTriangle className="w-12 h-12 text-rose-500" />
                        </div>
                        <div className="relative z-10">
                          <div className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Zap className="w-3 h-3" /> ANOMALİ ANALİZİ
                          </div>
                          <p className="text-xs text-rose-100 leading-relaxed font-medium">
                            {selectedNode.fullData.anomalyReason}
                          </p>
                          <div className="mt-4 pt-4 border-t border-rose-500/20 grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-[8px] text-rose-400/60 uppercase font-bold">Güven Skoru</div>
                              <div className="text-sm font-bold text-rose-400">%94.2</div>
                            </div>
                            <div>
                              <div className="text-[8px] text-rose-400/60 uppercase font-bold">Önem Derecesi</div>
                              <div className="text-sm font-bold text-rose-400">KRİTİK</div>
                            </div>
                          </div>
                        </div>
                      </section>
                    )}

                    <section className="space-y-3">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">RAPOR ÖZETİ</h4>
                      <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 text-[11px] text-slate-300 leading-relaxed font-light">
                        {selectedNode.fullData.summary}
                      </div>
                    </section>

                    <section className="space-y-3">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">İLGİLİ VARLIKLAR</h4>
                      <div className="flex flex-wrap gap-2">
                        {connectedNodes.map((ent: any, idx: number) => (
                          <button 
                            key={idx}
                            onClick={() => {
                              const entId = `ent_${ent.type}_${slugify(ent.label)}`;
                              filterByEntity(entId);
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all hover:scale-105",
                              ent.type === 'anomaly' 
                                ? "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20" 
                                : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                            )}
                          >
                            {ent.label}
                          </button>
                        ))}
                      </div>
                    </section>

                    {relatedAnomalies.length > 0 && (
                      <section className="space-y-3">
                        <h4 className="text-[10px] font-bold text-rose-500 uppercase tracking-widest flex items-center gap-2">
                          <Activity className="w-3 h-3" /> BENZER TEHDİTLER
                        </h4>
                        <div className="space-y-2">
                          {relatedAnomalies.map(a => (
                            <div key={a.id} className="p-3 bg-white/5 border border-white/10 rounded-lg group hover:bg-white/10 transition-colors cursor-pointer">
                              <div className="text-[8px] text-rose-400 font-bold mb-1">{new Date(a.timestamp).toLocaleString('tr-TR')}</div>
                              <div className="text-[10px] text-white font-bold truncate">{a.title}</div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    <div className="pt-4">
                      <a 
                        href={selectedNode.fullData.link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-xl hover:bg-emerald-500/20 transition-all shadow-lg shadow-emerald-500/5"
                      >
                        KAYNAK DOKÜMANI GÖRÜNTÜLE <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Dossier Footer */}
              <div className="p-4 bg-slate-900/30 border-t border-slate-800 shrink-0">
                <div className="flex items-center justify-between text-[8px] text-slate-600 font-mono uppercase tracking-widest">
                  <span>Gözcü Intelligence System v4.0</span>
                  <span>Gizli / Dahili Kullanım</span>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
