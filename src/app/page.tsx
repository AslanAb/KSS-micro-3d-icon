"use client";

import AudioRecorder_v2 from "./components/AudioRecorder_v2";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <div className="mt-6 w-full">
          <h2 className="font-semibold mb-2">Диктофон</h2>
          <AudioRecorder_v2 />
        </div>
      </main>
    </div>
  );
}
