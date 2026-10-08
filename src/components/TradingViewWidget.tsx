import { useEffect, useRef } from "react";

interface TradingViewWidgetProps {
  scriptUrl: string;
  config: Record<string, unknown>;
  height?: number;
  className?: string;
}

export default function TradingViewWidget({
  scriptUrl,
  config,
  height = 400,
  className = "",
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget
    container.innerHTML = `<div class="tradingview-widget-container__widget"></div>
      <div class="tradingview-widget-copyright">
        <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">
          <span class="blue-text">Track all markets on TradingView</span>
        </a>
      </div>`;

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.innerHTML = JSON.stringify({ ...config, width: "100%", height });
    container.appendChild(script);
    scriptRef.current = script;

    return () => {
      if (container) container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptUrl, JSON.stringify(config), height]);

  return (
    <div
      className={`tv-widget-container ${className}`}
      style={{ height }}
      ref={containerRef}
    />
  );
}
