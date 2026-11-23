import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { RequireIdentity } from '@/features/identity/RequireIdentity';
import { LandingPage } from '@/features/landing/LandingPage';
import { SongPlayer, useSongWarmUp } from '@/features/music/SongDock';
import { NotFoundPage } from './NotFoundPage';

// The landing page ships in the first chunk; festival screens load when a visitor goes there.
const RiversPage = lazy(() => import('@/features/rivers/RiversPage').then((m) => ({ default: m.RiversPage })));
const CreatePage = lazy(() => import('@/features/krathong/CreatePage').then((m) => ({ default: m.CreatePage })));
const RiverPage = lazy(() => import('@/features/festival/RiverPage').then((m) => ({ default: m.RiverPage })));
const RoomPage = lazy(() => import('@/features/festival/RiverPage').then((m) => ({ default: m.RoomPage })));
const JoinPage = lazy(() => import('@/features/rooms/JoinPage').then((m) => ({ default: m.JoinPage })));

function PageLoading() {
  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center gap-4 text-mist" role="status">
      <span className="size-3 animate-pulse rounded-full bg-gold shadow-[0_0_24px_6px_rgb(245_199_106/0.5)]" />
      กำลังจุดเทียนรอ
    </div>
  );
}

export function App() {
  useSongWarmUp();
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/rivers" element={<RequireIdentity><RiversPage /></RequireIdentity>} />
          <Route path="/create" element={<RequireIdentity><CreatePage /></RequireIdentity>} />
          <Route path="/river/:riverId" element={<RequireIdentity><RiverPage /></RequireIdentity>} />
          <Route path="/room/:roomId" element={<RequireIdentity><RoomPage /></RequireIdentity>} />
          <Route path="/join" element={<RequireIdentity><JoinPage /></RequireIdentity>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <SongPlayer />
    </BrowserRouter>
  );
}
