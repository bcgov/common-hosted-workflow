import { NextResponse } from 'next/server';

declare global {
  var cardStore: any[];
}

if (!global.cardStore) {
  global.cardStore = [];
}

export async function POST(request: Request) {
  const data = await request.json();
  const cards = Array.isArray(data) ? data : [data];

  if (Array.isArray(cards)) {
    const processed = cards.map((card) => {
      if (card.contentType === 'application/vnd.microsoft.card.adaptive') {
        return card.content;
      }

      return card;
    });

    global.cardStore = [...processed, ...global.cardStore].slice(0, 20);
    return NextResponse.json({ message: 'Cards received' });
  }

  return NextResponse.json({ error: 'Payload must be an array' }, { status: 400 });
}

export async function GET() {
  return NextResponse.json(global.cardStore);
}

export async function DELETE() {
  global.cardStore = [];
  return NextResponse.json({ message: 'Feed cleared' });
}
