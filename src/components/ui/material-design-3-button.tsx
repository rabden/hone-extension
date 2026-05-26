import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// --- 1. TUNED CONSTANTS (MD3 Physics Configuration) ---
const PRESS_GROW_MS = 450;
const MINIMUM_PRESS_MS = 300;
const INITIAL_ORIGIN_SCALE = 0.2;
const PADDING = 10;
const SOFT_EDGE_MINIMUM_SIZE = 75;
const SOFT_EDGE_CONTAINER_RATIO = 0.35;
const ANIMATION_FILL = "forwards";
const TOUCH_DELAY_MS = 150;
const EASING_STANDARD = "cubic-bezier(0.2, 0, 0, 1)";

// --- 2. DYNAMIC AUDIO GENERATOR (For XL/2XL Buttons) ---
const playTactilePopSound = () => {
  try {
    // Safely initialize Web Audio API
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Create a pleasant, snappy "pop" sound using a sine wave
    osc.type = "sine";
    const now = ctx.currentTime;
    
    // Pitch drops rapidly to simulate a physical click
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);

    // Volume fades out cleanly over 50ms
    gainNode.gain.setValueAtTime(0.15, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.start(now);
    osc.stop(now + 0.05);
  } catch (e) {
    // Silently fail if audio context is restricted by the browser (e.g. before user interaction)
  }
};

// --- 3. TYPES & STATE MACHINE ---
const RippleState = {
  INACTIVE: 'INACTIVE',
  TOUCH_DELAY: 'TOUCH_DELAY',
  HOLDING: 'HOLDING',
  WAITING_FOR_CLICK: 'WAITING_FOR_CLICK',
} as const;

// --- 4. MATERIAL RIPPLE HOOK ---
const useMaterialRipple = (disabled = false) => {
  const [hovered, setHovered] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);

  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const rippleEffectRef = React.useRef<HTMLDivElement>(null);

  const stateRef = React.useRef<string>(RippleState.INACTIVE);
  const rippleStartEventRef = React.useRef<React.PointerEvent | null>(null);
  const growAnimationRef = React.useRef<Animation | null>(null);

  const initialSizeRef = React.useRef(0);
  const rippleScaleRef = React.useRef("");
  const rippleSizeRef = React.useRef("");

  const isTouch = (event: React.PointerEvent) => event.pointerType === "touch";

  const shouldReactToEvent = (event: React.PointerEvent) => {
    if (disabled || !event.isPrimary) return false;
    if (
      rippleStartEventRef.current &&
      rippleStartEventRef.current.pointerId !== event.pointerId
    ) {
      return false;
    }
    if (event.type === "pointerenter" || event.type === "pointerleave") {
      return !isTouch(event);
    }
    const isPrimaryButton = event.buttons === 1;
    return isTouch(event) || isPrimaryButton;
  };

  const determineRippleSize = () => {
    if (!surfaceRef.current) return;
    const { height, width } = surfaceRef.current.getBoundingClientRect();
    const maxDim = Math.max(height, width);
    const softEdgeSize = Math.max(
      SOFT_EDGE_CONTAINER_RATIO * maxDim,
      SOFT_EDGE_MINIMUM_SIZE
    );

    const initialSize = Math.floor(maxDim * INITIAL_ORIGIN_SCALE);
    const hypotenuse = Math.sqrt(width ** 2 + height ** 2);
    const maxRadius = hypotenuse + PADDING;

    initialSizeRef.current = initialSize;
    const rippleScale = (maxRadius + softEdgeSize) / initialSize;

    rippleScaleRef.current = `${rippleScale}`;
    rippleSizeRef.current = `${initialSize}px`;
  };

  const getTranslationCoordinates = (event?: React.PointerEvent) => {
    if (!surfaceRef.current)
      return { startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
    const { height, width, left, top } =
      surfaceRef.current.getBoundingClientRect();

    const endPoint = {
      x: (width - initialSizeRef.current) / 2,
      y: (height - initialSizeRef.current) / 2,
    };

    let startPoint;
    if (event) {
      startPoint = {
        x: event.clientX - left,
        y: event.clientY - top,
      };
    } else {
      startPoint = {
        x: width / 2,
        y: height / 2,
      };
    }

    startPoint = {
      x: startPoint.x - initialSizeRef.current / 2,
      y: startPoint.y - initialSizeRef.current / 2,
    };

    return { startPoint, endPoint };
  };

  const startPressAnimation = (event?: React.PointerEvent) => {
    setPressed(true);
    if (!rippleEffectRef.current) return;

    growAnimationRef.current?.cancel();
    determineRippleSize();

    const { startPoint, endPoint } = getTranslationCoordinates(event);

    growAnimationRef.current = rippleEffectRef.current.animate(
      {
        top: [0, 0],
        left:[0, 0],
        height: [rippleSizeRef.current, rippleSizeRef.current],
        width: [rippleSizeRef.current, rippleSizeRef.current],
        transform:[
          `translate(${startPoint.x}px, ${startPoint.y}px) scale(1)`,
          `translate(${endPoint.x}px, ${endPoint.y}px) scale(${rippleScaleRef.current})`,
        ],
      },
      {
        duration: PRESS_GROW_MS,
        easing: EASING_STANDARD,
        fill: ANIMATION_FILL,
      }
    );
  };

  const endPressAnimation = async () => {
    rippleStartEventRef.current = null;
    stateRef.current = RippleState.INACTIVE;

    const animation = growAnimationRef.current;
    let pressAnimationPlayState = Infinity;

    if (animation && typeof animation.currentTime === "number") {
      pressAnimationPlayState = animation.currentTime;
    }

    if (pressAnimationPlayState < MINIMUM_PRESS_MS) {
      await new Promise((resolve) => {
        setTimeout(resolve, MINIMUM_PRESS_MS - pressAnimationPlayState);
      });
    }

    if (growAnimationRef.current !== animation) return;

    setPressed(false);
  };

  const handlePointerDown = async (event: React.PointerEvent) => {
    if (!shouldReactToEvent(event)) return;
    rippleStartEventRef.current = event;

    if (!isTouch(event)) {
      stateRef.current = RippleState.WAITING_FOR_CLICK;
      startPressAnimation(event);
      return;
    }

    stateRef.current = RippleState.TOUCH_DELAY;
    await new Promise((resolve) => setTimeout(resolve, TOUCH_DELAY_MS));

    if (stateRef.current !== RippleState.TOUCH_DELAY) return;

    stateRef.current = RippleState.HOLDING;
    startPressAnimation(event);
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!shouldReactToEvent(event)) return;
    if (stateRef.current === RippleState.HOLDING) {
      stateRef.current = RippleState.WAITING_FOR_CLICK;
      return;
    }
    if (stateRef.current === RippleState.TOUCH_DELAY) {
      stateRef.current = RippleState.WAITING_FOR_CLICK;
      startPressAnimation(rippleStartEventRef.current || undefined);
      return;
    }
  };

  const handlePointerEnter = (event: React.PointerEvent) => {
    if (!shouldReactToEvent(event)) return;
    setHovered(true);
  };

  const handlePointerLeave = (event: React.PointerEvent) => {
    if (!shouldReactToEvent(event)) return;
    setHovered(false);
    if (stateRef.current !== RippleState.INACTIVE) {
      endPressAnimation();
    }
  };

  const handleClick = () => {
    if (disabled) return;
    if (stateRef.current === RippleState.WAITING_FOR_CLICK) {
      endPressAnimation();
      return;
    }
    if (stateRef.current === RippleState.INACTIVE) {
      startPressAnimation();
      endPressAnimation();
    }
  };

  return {
    surfaceRef,
    rippleEffectRef,
    hovered,
    pressed,
    events: {
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerEnter: handlePointerEnter,
      onPointerLeave: handlePointerLeave,
      onClick: handleClick,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      },
    },
  };
};

// --- 5. RIPPLE COMPONENT ---
interface RippleProps {
  hovered: boolean;
  pressed: boolean;
  rippleEffectRef: React.RefObject<HTMLDivElement | null>;
}

const Ripple = React.forwardRef<HTMLDivElement, RippleProps>(
  ({ hovered, pressed, rippleEffectRef }, ref) => {
    return (
      <div
        ref={ref}
        className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none z-0 surface"
        aria-hidden="true"
      >
        <div
          className={cn(
            "absolute inset-0 bg-current transition-opacity duration-200 linear",
            hovered ? "opacity-[0.08]" : "opacity-0",
            pressed && "opacity-[0.12]"
          )}
        />
        <div
          ref={rippleEffectRef}
          className="absolute rounded-full opacity-0 bg-current"
          style={{
            background:
              "radial-gradient(closest-side, currentColor max(calc(100% - 70px), 65%), transparent 100%)",
            transition: "opacity 375ms linear",
            opacity: pressed ? "0.25" : "0",
            transitionDuration: pressed ? "105ms" : "375ms",
          }}
        />
      </div>
    );
  }
);
Ripple.displayName = "Ripple";

// --- 6. MD3 EXPRESSIVE BUTTON VARIANTS (SHADCN API ALIGNED) ---
const buttonVariants = cva(
  "group relative inline-flex items-center justify-center whitespace-nowrap font-medium tracking-[0.01em] transition-[background-color,color,box-shadow,border-radius] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-[0.38] disabled:shadow-none overflow-hidden [&_svg]:transition-transform [&_svg]:duration-300 [&_svg]:ease-[cubic-bezier(0.2,0.8,0.2,1.2)] data-[pressed=true]:[&_svg]:scale-[0.90]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:shadow",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:shadow",
        outline: "bg-transparent text-foreground shadow-none border border-border hover:bg-secondary/20",
        secondary: "bg-secondary/50 text-secondary-foreground shadow-none hover:bg-secondary/70",
        ghost: "bg-transparent text-primary shadow-none hover:bg-primary/10",
        link: "text-primary underline-offset-4 hover:underline",
        elevated: "bg-card text-card-foreground shadow-md hover:shadow-lg data-[pressed=true]:shadow-sm",
      },
      size: {
        // Core Sizes
        default: "py-[10px] px-[16px] gap-[8px] text-sm", 
        sm: "py-[6px] px-[12px] gap-[8px] text-sm",       
        lg: "py-[16px] px-[24px] gap-[8px] text-base",    
        icon: "p-[8px] w-[40px] h-[40px]",
        // Expressive Scales
        xl: "py-[32px] px-[48px] gap-[12px] text-2xl",    
        "2xl": "py-[48px] px-[64px] gap-[16px] text-3xl", 
        "icon-sm": "p-[6px] w-[32px] h-[32px]",
        "icon-lg": "p-[16px] w-[56px] h-[56px]",
        "icon-xl": "p-[32px] w-[96px] h-[96px]",
        "icon-2xl": "p-[48px] w-[136px] h-[136px]",
      },
      shape: {
        round: "", 
        square: "",
        "split-left": "",  // Automatically injected by SplitButton
        "split-right": "", // Automatically injected by SplitButton
      },
    },
    compoundVariants:[
      // Nullify borders on non-outline variants to prevent stroke artifacts
      { variant:["default", "destructive", "secondary", "ghost", "link", "elevated"], className: "border-transparent" },
      // Expressive outlined dynamic border-widths
      { variant: "outline", size:["xl", "icon-xl"], className: "border-2" },
      { variant: "outline", size:["2xl", "icon-2xl"], className: "border-[3px]" },
      
      // SHAPE PHYSICS: Standard "Round" Morphing (Pill -> Squish)
      { shape: "round", size: ["sm", "icon-sm"], className: "rounded-[16px] data-[pressed=true]:rounded-[8px]" },
      { shape: "round", size: ["default", "icon"], className: "rounded-[20px] data-[pressed=true]:rounded-[8px]" },
      { shape: "round", size:["lg", "icon-lg"], className: "rounded-[28px] data-[pressed=true]:rounded-[12px]" },
      { shape: "round", size: ["xl", "icon-xl"], className: "rounded-[48px] data-[pressed=true]:rounded-[16px]" },
      { shape: "round", size: ["2xl", "icon-2xl"], className: "rounded-[68px] data-[pressed=true]:rounded-[16px]" },

      // SHAPE PHYSICS: Standard "Square" Morphing (Squish -> Pill)
      { shape: "square", size: ["sm", "icon-sm"], className: "rounded-[12px] data-[pressed=true]:rounded-[16px]" },
      { shape: "square", size: ["default", "icon"], className: "rounded-[12px] data-[pressed=true]:rounded-[20px]" },
      { shape: "square", size:["lg", "icon-lg"], className: "rounded-[16px] data-[pressed=true]:rounded-[28px]" },
      { shape: "square", size: ["xl", "icon-xl"], className: "rounded-[28px] data-[pressed=true]:rounded-[48px]" },
      { shape: "square", size: ["2xl", "icon-2xl"], className: "rounded-[28px] data-[pressed=true]:rounded-[68px]" },

      // SPLIT-LEFT PHYSICS (Your custom tweaks implemented)
      { shape: "split-left", size: ["sm", "icon-sm"], className: "rounded-l-[16px] rounded-r-[4px] data-[pressed=true]:rounded-l-[16px] data-[pressed=true]:rounded-r-[16px]" },
      { shape: "split-left", size: ["default", "icon"], className: "rounded-l-[24px] rounded-r-[4px] data-[pressed=true]:rounded-l-[24px] data-[pressed=true]:rounded-r-[24px]" },
      { shape: "split-left", size:["lg", "icon-lg"], className: "rounded-l-[28px] rounded-r-[4px] data-[pressed=true]:rounded-l-[28px] data-[pressed=true]:rounded-r-[28px]" },
      { shape: "split-left", size:["xl", "icon-xl"], className: "rounded-l-[46px] rounded-r-[6px] data-[pressed=true]:rounded-l-[46px] data-[pressed=true]:rounded-r-[46px]" },
      { shape: "split-left", size: ["2xl", "icon-2xl"], className: "rounded-l-[62px] rounded-r-[12px] data-[pressed=true]:rounded-l-[62px] data-[pressed=true]:rounded-r-[62px]" },

      // SPLIT-RIGHT PHYSICS (Your custom tweaks mirrored for right)
      { shape: "split-right", size: ["sm", "icon-sm"], className: "rounded-r-[16px] rounded-l-[4px] data-[pressed=true]:rounded-r-[16px] data-[pressed=true]:rounded-l-[16px]" },
      { shape: "split-right", size:["default", "icon"], className: "rounded-r-[24px] rounded-l-[4px] data-[pressed=true]:rounded-r-[24px] data-[pressed=true]:rounded-l-[24px]" },
      { shape: "split-right", size: ["lg", "icon-lg"], className: "rounded-r-[28px] rounded-l-[4px] data-[pressed=true]:rounded-r-[28px] data-[pressed=true]:rounded-l-[28px]" },
      { shape: "split-right", size: ["xl", "icon-xl"], className: "rounded-r-[46px] rounded-l-[6px] data-[pressed=true]:rounded-r-[46px] data-[pressed=true]:rounded-l-[46px]" },
      { shape: "split-right", size: ["2xl", "icon-2xl"], className: "rounded-r-[62px] rounded-l-[12px] data-[pressed=true]:rounded-r-[62px] data-[pressed=true]:rounded-l-[62px]" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "round",
    },
  }
);

// --- 7. CORE BUTTON COMPONENT ---
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  noRipple?: boolean;
  noMorph?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      shape,
      asChild = false,
      noRipple = false,
      noMorph = false,
      onClick,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const isRippleLogicDisabled = props.disabled || (noRipple && noMorph);
    const { surfaceRef, rippleEffectRef, hovered, pressed, events } =
      useMaterialRipple(isRippleLogicDisabled);

    const componentProps = {
      className: cn(buttonVariants({ variant, size, shape, className })),
      style: style,
      "data-pressed": noMorph ? undefined : pressed, 
      ...events,
      onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
        // Fire ripple and standard events
        events.onClick();
        
        // --- NEW FEATURE: Auditory Feedback for Prominent Buttons ---
        if (size && ["xl", "2xl", "icon-xl", "icon-2xl"].includes(size)) {
          playTactilePopSound();
        }

        // Fire user's custom onClick if provided
        onClick?.(e);
      },
      ...props,
    };

    if (asChild) {
      const child = React.Children.only(children) as React.ReactElement<{ children?: React.ReactNode }>;

      return (
        <Slot ref={ref} {...componentProps}>
          {React.cloneElement(child, {
            children: (
              <>
                {(!noRipple && variant !== "link") && (
                  <Ripple
                    ref={surfaceRef}
                    rippleEffectRef={rippleEffectRef}
                    hovered={hovered}
                    pressed={pressed}
                  />
                )}
                <span className="relative z-10 flex items-center justify-center gap-[inherit] pointer-events-none">
                  {child.props.children}
                </span>
              </>
            ),
          })}
        </Slot>
      );
    }

    return (
      <button ref={ref} {...componentProps}>
        {(!noRipple && variant !== "link") && (
          <Ripple
            ref={surfaceRef}
            rippleEffectRef={rippleEffectRef}
            hovered={hovered}
            pressed={pressed}
          />
        )}
        <span className="relative z-10 flex items-center justify-center gap-[inherit] pointer-events-none">
          {children}
        </span>
      </button>
    );
  }
);
Button.displayName = "Button";

// --- 8. MD3 SPLIT BUTTON / CONNECTED BUTTON GROUP ---
const SplitButton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const childrenArray = React.Children.toArray(children);
    
    return (
      <div
        ref={ref}
        // Flex items-stretch guarantees the child buttons evaluate to perfectly identical heights
        className={cn("inline-flex items-stretch justify-center gap-[2px]", className)}
        {...props}
      >
        {childrenArray.map((child, index) => {
          if (!React.isValidElement(child)) return child;
          
          const isFirst = index === 0;
          const isLast = index === childrenArray.length - 1;
          
          return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
            // Automatically inject the isolated Split Button physics
            shape: isFirst ? "split-left" : isLast ? "split-right" : "square",
            // Allow the button to naturally stretch to the identical container height
            className: cn((child as React.ReactElement<Record<string, unknown>>).props.className as string | undefined, "!h-auto self-stretch")
          });
        })}
      </div>
    );
  }
);
SplitButton.displayName = "SplitButton";

export { Button, buttonVariants, SplitButton };