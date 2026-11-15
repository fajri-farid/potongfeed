import type { Metadata } from "next";
import { EditorWorkspace } from "@/components/EditorWorkspace";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Editor Grid Instagram — ${APP_NAME}`,
  description:
    "Workspace editor grid Instagram 3:4, 4:5, dan 1:1 dengan panduan safe area, mockup profil interaktif, dan ekspor HD/PNG lossless 100% lokal di browser.",
};

export default function EditorPage() {
  return <EditorWorkspace />;
}
