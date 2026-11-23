import { BrowserRouter, Route, Routes } from 'react-router';
import { CreatePage } from '@/features/krathong/CreatePage';
import { RiverPage, RoomPage } from '@/features/festival/RiverPage';
import { RequireIdentity } from '@/features/identity/RequireIdentity';
import { LandingPage } from '@/features/landing/LandingPage';
import { SongPlayer } from '@/features/music/SongDock';
import { JoinPage } from '@/features/rooms/JoinPage';
import { RiversPage } from '@/features/rivers/RiversPage';
import { NotFoundPage } from './NotFoundPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/rivers" element={<RequireIdentity><RiversPage /></RequireIdentity>} />
        <Route path="/create" element={<RequireIdentity><CreatePage /></RequireIdentity>} />
        <Route path="/river/:riverId" element={<RequireIdentity><RiverPage /></RequireIdentity>} />
        <Route path="/room/:roomId" element={<RequireIdentity><RoomPage /></RequireIdentity>} />
        <Route path="/join" element={<RequireIdentity><JoinPage /></RequireIdentity>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <SongPlayer />
    </BrowserRouter>
  );
}
