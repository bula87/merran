import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group"
import { Radio } from "@base-ui/react/radio"
import { cn } from "cn"

export function RadioGroup({ ...props }: BaseRadioGroup.Props) {
  return <BaseRadioGroup data-slot="radio-group" {...props} />
}

export function RadioItem({ className, children, ...props }: Radio.Root.Props) {
  return (
    <Radio.Root
      data-slot="radio-item"
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-xl py-2 pr-8 pl-3 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="radio-item-indicator"
      >
        <Radio.Indicator />
      </span>
      {children}
    </Radio.Root>
  )
}
