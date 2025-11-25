"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DwightBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("Question: What kind of bear is best?");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 500) {
        setIsVisible(true);
      }
    };

    const handleDwightSay = (e: Event) => {
      const customEvent = e as CustomEvent;
      setMessage(customEvent.detail);
      setIsOpen(true);
      setTimeout(() => setIsOpen(false), 3000);
    };

    window.addEventListener("scroll", handleScroll);
    window.addEventListener("dwight-say", handleDwightSay);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("dwight-say", handleDwightSay);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="bg-card border p-4 rounded-lg shadow-xl max-w-xs mb-2 relative"
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-3 h-3" />
            </Button>
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                DS
              </div>
              <div>
                <p className="font-bold text-sm">Assistant to the Regional Manager</p>
                <p className="text-sm text-muted-foreground mt-1">{message}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
      >
        <MessageSquare className="w-6 h-6" />
      </motion.button>
    </div>
  );
}
