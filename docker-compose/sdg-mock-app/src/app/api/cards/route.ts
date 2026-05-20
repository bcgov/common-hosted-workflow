import { NextResponse } from 'next/server';

declare global {
  var cardStore: unknown[] | undefined;
}

function getCardStore() {
  globalThis.cardStore ??= [];
  return globalThis.cardStore;
}

export async function POST(request: Request) {
  const data = await request.json();
  const cards = Array.isArray(data) ? data : [data];

  const processed = cards.map((card) => {
    if (
      card &&
      typeof card === 'object' &&
      'contentType' in card &&
      (card as { contentType?: string }).contentType === 'application/vnd.microsoft.card.adaptive'
    ) {
      return (card as { content?: unknown }).content;
    }

    return card;
  });

  globalThis.cardStore = [...processed, ...getCardStore()].slice(0, 20);
  return NextResponse.json({ message: 'Cards received' });
}

export async function GET() {
  return NextResponse.json(getCardStore());
}

export async function DELETE() {
  globalThis.cardStore = [];
  return NextResponse.json({ message: 'Feed cleared' });
}
