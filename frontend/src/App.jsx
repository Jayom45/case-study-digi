import { Route, Routes, useLocation } from "react-router-dom";
import TopBar from "./components/TopBar";
import Inbox from "./pages/Inbox";
import { Items, KnowledgeBase, MeetingDetail, Meetings } from "./pages/Manage";
import NotFound from "./pages/NotFound";
import TakeoverPack from "./pages/TakeoverPack";
import Welcome from "./pages/Welcome";
import WhoAreYou from "./pages/WhoAreYou";

export default function App() {
  const { pathname } = useLocation();
  const isWelcome = pathname === "/";
  return (
    <div className="min-h-screen">
      {!isWelcome && <TopBar />}
      <main className={isWelcome ? "" : "mx-auto max-w-7xl px-6 py-8"}>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/who" element={<WhoAreYou />} />
          <Route path="/me/:personId" element={<Inbox />} />
          <Route path="/takeover/:meetingId/:personId" element={<TakeoverPack />} />
          <Route path="/manage/meetings" element={<Meetings />} />
          <Route path="/manage/meetings/:id" element={<MeetingDetail />} />
          <Route path="/manage/items" element={<Items />} />
          <Route path="/manage/kb" element={<KnowledgeBase />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
