/**
 * Framer Motion animation variants for landing page
 * Provides reusable animation configurations for consistent motion design
 */

import { Variants } from "framer-motion";

// Fade in animation with optional direction
export const fadeIn = (
  direction: "up" | "down" | "left" | "right" = "up",
  delay: number = 0
): Variants => {
  return {
    hidden: {
      y: direction === "up" ? 40 : direction === "down" ? -40 : 0,
      x: direction === "left" ? 40 : direction === "right" ? -40 : 0,
      opacity: 0,
    },
    show: {
      y: 0,
      x: 0,
      opacity: 1,
      transition: {
        type: "spring",
        duration: 1.2,
        delay,
        ease: [0.25, 0.25, 0.25, 0.75],
      },
    },
  };
};

// Stagger container for child animations
export const staggerContainer = (
  staggerChildren: number = 0.1,
  delayChildren: number = 0
): Variants => {
  return {
    hidden: {},
    show: {
      transition: {
        staggerChildren,
        delayChildren,
      },
    },
  };
};

// Scale animation with hover effect
export const scaleIn = (delay: number = 0): Variants => {
  return {
    hidden: {
      scale: 0,
      opacity: 0,
    },
    show: {
      scale: 1,
      opacity: 1,
      transition: {
        type: "spring",
        duration: 0.5,
        delay,
      },
    },
  };
};

// Slide animation
export const slideIn = (
  direction: "left" | "right" | "up" | "down",
  type: "spring" | "tween" = "spring",
  delay: number = 0,
  duration: number = 0.75
): Variants => {
  return {
    hidden: {
      x: direction === "left" ? "-100%" : direction === "right" ? "100%" : 0,
      y: direction === "up" ? "100%" : direction === "down" ? "-100%" : 0,
      opacity: 0,
    },
    show: {
      x: 0,
      y: 0,
      opacity: 1,
      transition: {
        type,
        delay,
        duration,
      },
    },
  };
};

// Hover scale effect
export const hoverScale: Variants = {
  hover: {
    scale: 1.05,
    transition: {
      duration: 0.3,
    },
  },
};

// Glow effect on hover
export const glowEffect = {
  hover: {
    boxShadow: "0 0 20px rgba(59, 130, 246, 0.5)",
    transition: {
      duration: 0.3,
    },
  },
};

// Text reveal animation (typing effect)
export const textReveal = (delay: number = 0): Variants => {
  return {
    hidden: {
      opacity: 0,
      y: 20,
    },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        delay,
      },
    },
  };
};

// Rotation animation for loader/spinner
export const rotate = {
  animate: {
    rotate: 360,
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "linear",
    },
  },
};

// Parallax effect
export const parallax = (offset: number = 50): Variants => {
  return {
    initial: { y: 0 },
    animate: {
      y: offset,
      transition: {
        duration: 0.5,
        ease: "easeOut",
      },
    },
  };
};

// Pulse animation
export const pulse = {
  animate: {
    scale: [1, 1.05, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// Card hover effect with lift and shadow
export const cardHover: Variants = {
  rest: {
    scale: 1,
    y: 0,
  },
  hover: {
    scale: 1.02,
    y: -8,
    transition: {
      duration: 0.3,
    },
  },
};

// Appear from bottom (for modals, drawers)
export const appearFromBottom = (delay: number = 0): Variants => {
  return {
    hidden: {
      y: "100%",
      opacity: 0,
    },
    show: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        damping: 25,
        stiffness: 120,
        delay,
      },
    },
    exit: {
      y: "100%",
      opacity: 0,
      transition: {
        duration: 0.2,
      },
    },
  };
};

// Zoom in animation
export const zoomIn = (delay: number = 0): Variants => {
  return {
    hidden: {
      scale: 0.8,
      opacity: 0,
    },
    show: {
      scale: 1,
      opacity: 1,
      transition: {
        type: "spring",
        damping: 20,
        stiffness: 100,
        delay,
      },
    },
  };
};

// Bounce effect
export const bounce = {
  animate: {
    y: [0, -10, 0],
    transition: {
      duration: 0.6,
      repeat: Infinity,
      repeatDelay: 1,
    },
  },
};
