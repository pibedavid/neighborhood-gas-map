import React, { useState } from 'react';
import { TIME_OF_DAY_CONFIG, TimeOfDay } from '../types';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const Legend: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="glass-panel"
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '20px',
        zIndex: 500,
        borderRadius: '16px',
        padding: collapsed ? '8px 14px' : '14px 18px',
        maxWidth: '280px',
        transition: 'all 0.2s ease'
      }}
    >
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>Pin Time Colors</span>
        <button
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex' }}
          aria-label={collapsed ? 'Expand legend' : 'Collapse legend'}
        >
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {!collapsed && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(['morning', 'afternoon', 'evening', 'night'] as TimeOfDay[]).map((tod) => {
            const conf = TIME_OF_DAY_CONFIG[tod];
            return (
              <div key={tod} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: conf.border,
                      boxShadow: `0 0 0 2px ${conf.bg}`,
                      display: 'inline-block'
                    }}
                  />
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b' }}>
                    {conf.emoji} {conf.label}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>{conf.timeRange}</span>
              </div>
            );
          })}

          <div
            style={{
              marginTop: '6px',
              paddingTop: '8px',
              borderTop: '1px solid #e2e8f0',
              fontSize: '11px',
              color: '#64748b',
              lineHeight: '1.4'
            }}
          >
            💡 <strong>Tap anywhere on map</strong> to drop your pin and log what time you smelled gas.
          </div>
        </div>
      )}
    </div>
  );
};
