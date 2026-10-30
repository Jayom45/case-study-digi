import { AnimatePresence, motion } from "framer-motion";
import { Route, Routes, useLocation } from "react-router-dom";
import TopBar from "./components/TopBar";
import Inbox from "./pages/Inbox";
import Items from "./pages/Items";
import KnowledgeBase from "./pages/KnowledgeBase";
import MeetingDetail from "./pages/MeetingDetail";
import Meetings from "./pages/Meetings";
import NotFound from "./pages/NotFound";
import TakeoverPack from "./pages/TakeoverPack";
import Welcome from "./pages/Welcome";
import WhoAreYou from "./pages/WhoAreYou";

export default function App() {
  const location = useLocation();
  const isWelcome = location.pathname === "/";
  return (
    <div className="min-h-screen">
      {!isWelcome && <TopBar />}
      <main className={isWelcome ? "" : "mx-auto max-w-7xl px-6 py-8"}>
        {/* Gentle fade/slide between pages; keyed on the path so each page animates in. */}
        <AnimatePresence mode="wait">
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18, ease: "easeOut" }}>
            <Routes location={location}>
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
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
