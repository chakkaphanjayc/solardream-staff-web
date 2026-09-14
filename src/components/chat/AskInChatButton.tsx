"use client";

import { useState } from "react";
import { MessageCircle } from "@/components/ui/icons";
import { useChatStore, type ChatStore } from "@/store/useChatStore";
import { cn } from "@/lib/utils";
import { getMessengerUser, getOrCreateEntityThread } from "@/app/actions/chat";
import { toast } from "sonner";
import { GsapSpinner } from "@/components/ui/GsapMotion";

type PendingReference = NonNullable<ChatStore["pendingReference"]>;

interface AskInChatButtonProps {
  reference: PendingReference;
  label?: string;
  tooltip?: string;
  variant?: "pill" | "icon";
  className?: string;
}

export default function AskInChatButton(_props: AskInChatButtonProps) {
  return null;
}
