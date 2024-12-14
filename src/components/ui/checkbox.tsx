// Checkbox.tsx
"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "@radix-ui/react-icons"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxPrimitive.CheckboxProps
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={`w-5 h-5 border rounded flex items-center justify-center 
      focus:outline-none focus:ring-2 focus:ring-offset-2 
      data-[state=checked]:bg-blue-600 
      data-[state=checked]:border-transparent 
      ${className}`}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="text-white">
      <CheckIcon />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))

Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
