"use client";

import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const team = [
  {
    name: "varbees",
    role: "Solo Dev & Chief Coffee Officer",
    avatar: "VB",
    bio: "Built this entire thing. Yes, the backend too. And the frontend. And this bio.",
    fact: "Once debugged a race condition in his sleep. Literally.",
  },
  {
    name: "The Hand of AI",
    role: "Divine Intervention",
    avatar: "AI",
    bio: "Not just a tool, but the omniscient force guiding our keystrokes. It wrote this.",
    fact: "Knows the answer to life, the universe, and why your build failed.",
  },
  {
    name: "You?",
    role: "Future User",
    avatar: "?",
    bio: "The person who is going to make this project actually useful.",
    fact: "Has excellent taste in rate limiting solutions.",
  },
];

export function Team() {
  return (
    <section className="py-24">
      <div className="container max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
            Built by Humans
          </h2>
          <p className="mt-4 text-muted-foreground md:text-xl">
            (Guided by the Hand of AI, like the Hand of God, but with more
            syntax highlighting)
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {team.map((member, index) => (
            <motion.div
              key={member.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              viewport={{ once: true }}
              className="flex flex-col items-center text-center"
            >
              <Avatar className="w-24 h-24 mb-4 border-4 border-background shadow-xl">
                <AvatarFallback className="text-2xl">
                  {member.avatar}
                </AvatarFallback>
              </Avatar>
              <h3 className="text-xl font-bold">{member.name}</h3>
              <p className="text-primary font-medium mb-2">{member.role}</p>
              <p className="text-muted-foreground text-sm mb-4 max-w-xs">
                {member.bio}
              </p>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full">
                    Fun Fact
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Fun Fact: {member.name}</DialogTitle>
                    <DialogDescription className="pt-4 text-lg">
                      {member.fact}
                    </DialogDescription>
                  </DialogHeader>
                </DialogContent>
              </Dialog>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
