'use client';

import { useState, useEffect, useRef } from 'react';
import * as AdaptiveCards from 'adaptivecards';
import markdownit from 'markdown-it';

export default function Home() {
  const [cards, setCards] = useState([]);

  const fetchCards = async () => {
    try {
      const res = await fetch('/api/cards');
      const data = await res.json();
      setCards(data);
    } catch (err) {
      console.error('Failed to fetch cards', err);
    }
  };

  const clearCards = async () => {
    try {
      const res = await fetch('/api/cards', { method: 'DELETE' });
      if (res.ok) {
        setCards([]);
      }
    } catch (err) {
      console.error('Failed to clear cards', err);
    }
  };

  useEffect(() => {
    fetchCards();
    const interval = setInterval(fetchCards, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#1A1A1A] py-10 px-4 sm:px-6 lg:px-8 text-slate-200">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Adaptive Card Feed</h1>
            <p className="text-slate-500 text-sm mt-1">Monitoring incoming webhook payloads</p>
          </div>

          <div className="flex items-center space-x-3">
            <a
              href="https://adaptivecards.microsoft.com/designer"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-[#2D2D2D] hover:bg-blue-900/20 border border-[#3D3D3D] hover:border-blue-900/50 hover:text-blue-400 text-xs font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              </svg>
              Designer
            </a>

            <button
              onClick={clearCards}
              className="px-4 py-2 bg-[#2D2D2D] hover:bg-red-900/20 border border-[#3D3D3D] hover:border-red-900/50 hover:text-red-400 text-xs font-bold uppercase tracking-widest rounded-lg transition-all"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {cards.length === 0 ? (
            <div className="text-center py-20 bg-[#242424] rounded-xl border-2 border-dashed border-[#3D3D3D]">
              <p className="text-slate-500 font-medium italic">Waiting for incoming payloads...</p>
            </div>
          ) : (
            cards.map((cardJson, index) => <AdaptiveCardRenderer key={index} payload={cardJson} />)
          )}
        </div>
      </div>
    </div>
  );
}

function AdaptiveCardRenderer({ payload }: { payload: any }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
    }
  };

  useEffect(() => {
    if (!cardRef.current) return;

    const adaptiveCard = new AdaptiveCards.AdaptiveCard();

    AdaptiveCards.AdaptiveCard.onProcessMarkdown = (text, result) => {
      result.outputHtml = new markdownit().render(text);
      result.didProcess = true;
    };

    adaptiveCard.hostConfig = new AdaptiveCards.HostConfig({
      fontFamily: "Segoe UI, 'Helvetica Neue', sans-serif",
      containerStyles: {
        default: {
          backgroundColor: '#2D2D2D',
          foregroundColors: {
            default: {
              default: '#FFFFFF',
              subtle: '#B3B3B3',
            },
            accent: {
              default: '#4D9BFF',
              subtle: '#80B9FF',
            },
          },
        },
      },
      actions: {
        actionAlignment: 'Left',
        actionsOrientation: 'Horizontal',
        buttonSpacing: 8,
        actionStyle: 'Emphasis',
      },
    });

    try {
      adaptiveCard.parse(payload);
      const renderedElement = adaptiveCard.render();
      if (renderedElement) {
        cardRef.current.innerHTML = '';
        cardRef.current.appendChild(renderedElement);
      }
    } catch (e) {
      console.error('Card render error', e);
    }
  }, [payload]);

  return (
    <div className="group relative">
      <div className="flex items-center justify-between mb-2 px-1">
        <div />
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2D2D2D] hover:bg-[#3D3D3D] text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider rounded-md border border-[#444] transition-all shadow-sm"
        >
          {copied ? (
            <span className="text-green-400">Copied!</span>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
              Copy JSON
            </>
          )}
        </button>
      </div>

      <div
        className="bg-[#2D2D2D] rounded-xl shadow-xl border border-[#3D3D3D] p-4 hover:border-[#4D4D4D] transition-colors"
        ref={cardRef}
      />
    </div>
  );
}
