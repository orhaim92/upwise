import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { advisorEnabled } from '@/lib/features';
import { getConversation } from '@/app/(app)/advisor/actions';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!advisorEnabled()) {
    return new NextResponse('disabled', { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse('unauthorized', { status: 401 });
  }

  const { id } = await params;
  const convo = await getConversation(id);
  if (!convo) return new NextResponse('not found', { status: 404 });

  return NextResponse.json(convo);
}
