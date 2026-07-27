import * as React from "react"
import { cn } from "../lib/utils.js"
import { Avatar, AvatarFallback, AvatarImage } from "./avatar.js"
import { Badge } from "./badge.js"
import { Button } from "./button.js"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card.js"
import { Checkbox } from "./checkbox.js"
import {
  CollapsibleContent,
  Collapsible as LocalCollapsible,
  CollapsibleTrigger as LocalCollapsibleTrigger,
} from "./collapsible.js"
import { ConfirmActionButton } from "./confirm-action-button.js"
import { ContractTemplateAuthoringHelp } from "./contract-template-authoring-help.js"
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  Dialog as LocalDialog,
  DialogContent as LocalDialogContent,
} from "./dialog.js"
import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenu as LocalDropdownMenu,
  DropdownMenuItem as LocalDropdownMenuItem,
  DropdownMenuTrigger as LocalDropdownMenuTrigger,
} from "./dropdown-menu.js"
import { Input } from "./input.js"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./input-otp.js"
import { Label } from "./label.js"
// Notification* and RichTextEditor are intentionally NOT eagerly imported here
// (only `export *` re-exported below) — eager imports break tree-shaking,
// pulling tiptap + prosemirror (~600 KB raw) into every consumer of this
// barrel via the static dep chain. With re-export-only, Rollup can DCE
// them when unused. Same goes for any future heavy passthrough exports.
import { OverviewMetric } from "./overview-metric.js"
import { RadioGroup, RadioGroupItem } from "./radio-group.js"
import { ScrollArea, ScrollBar } from "./scroll-area.js"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select.js"
import { SelectionActionBar } from "./selection-action-bar.js"
import {
  Sheet as LocalSheet,
  SheetContent as LocalSheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./sheet.js"
import {
  SidebarMenuButton as LocalSidebarMenuButton,
  SidebarMenuSubButton as LocalSidebarMenuSubButton,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "./sidebar.js"
import { Toaster } from "./sonner.js"
import { Switch } from "./switch.js"
import { Textarea } from "./textarea.js"

export * from "./accordion.js"
export * from "./alert.js"
export * from "./alert-dialog.js"
export * from "./aspect-ratio.js"
export * from "./async-combobox.js"
export * from "./avatar.js"
export * from "./badge.js"
export * from "./big-calendar/index.js"
export * from "./breadcrumb.js"
export * from "./button.js"
export * from "./button-group.js"
export * from "./calendar.js"
export * from "./card.js"
export * from "./carousel.js"
// chart + dashboard-widgets pull recharts (~390 KB). Import from
// "@voyant-travel/ui/components/chart" / "/dashboard-widgets" directly.
export * from "./checkbox.js"
export * from "./collapsible.js"
export * from "./combobox.js"
export * from "./command.js"
export * from "./confirm-action-button.js"
export * from "./confirm-dialog.js"
export * from "./context-menu.js"
export * from "./contract-template-authoring-help.js"
export * from "./country-combobox.js"
export * from "./currency-combobox.js"
export * from "./currency-input.js"
export * from "./data-table.js"
export * from "./data-table-column-header.js"
export * from "./data-table-pagination.js"
export * from "./date-picker.js"
export * from "./date-time-field.js"
export * from "./date-time-picker.js"
export * from "./dialog.js"
export * from "./direction.js"
export * from "./drawer.js"
export * from "./dropdown-menu.js"
export * from "./empty.js"
export * from "./field.js"
export * from "./hover-card.js"
export * from "./image.js"
export * from "./input.js"
export * from "./input-group.js"
export * from "./input-otp.js"
export * from "./item.js"
export * from "./kbd.js"
export * from "./label.js"
export * from "./menubar.js"
export * from "./native-select.js"
export * from "./navigation-menu.js"
// Heavy passthroughs intentionally NOT re-exported here — they statically
// pull tiptap/prosemirror (rich-text-editor) or
// libphonenumber-js (phone-input). Import directly from
// "@voyant-travel/ui/components/<subpath>" instead. Keeping them out of the
// barrel lets every consumer that imports `Button` etc. tree-shake them.
export * from "./overview-metric.js"
export * from "./pagination.js"
export * from "./popover.js"
export * from "./progress.js"
export * from "./prompt-dialog.js"
export * from "./radio-group.js"
export * from "./resizable.js"
export * from "./scroll-area.js"
export * from "./segmented-control.js"
export * from "./select.js"
export * from "./selection-action-bar.js"
export * from "./separator.js"
export * from "./sheet.js"
export * from "./sidebar.js"
export * from "./skeleton.js"
export * from "./slider.js"
export * from "./sonner.js"
export * from "./spinner.js"
export * from "./switch.js"
export * from "./table.js"
export * from "./tabs.js"
export * from "./textarea.js"
export * from "./toggle.js"
export * from "./toggle-group.js"
export * from "./tooltip.js"
export * from "./typography.js"

type AsChildProps = {
  asChild?: boolean
  children?: React.ReactNode
}

type AsChildComponent = React.ComponentType<Record<string, unknown>>

function withAsChild<P extends object>(Component: React.ComponentType<P>, displayName: string) {
  function Wrapped({ asChild, children, ...props }: P & AsChildProps) {
    if (asChild && React.isValidElement(children)) {
      return (
        <Component
          {...({
            ...props,
            render: children,
          } as P)}
        />
      )
    }

    return <Component {...({ ...props, children } as P)} />
  }

  Wrapped.displayName = displayName

  return Wrapped
}

const dialogSizeClasses = {
  sm: "sm:max-w-sm",
  default: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  full: "sm:max-w-[calc(100vw-2rem)] sm:max-h-[calc(100vh-2rem)]",
} as const

function Dialog({ ...props }: React.ComponentProps<typeof LocalDialog>) {
  return <LocalDialog {...props} />
}

function DialogContent({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof LocalDialogContent> & {
  size?: keyof typeof dialogSizeClasses
}) {
  return <LocalDialogContent className={cn(dialogSizeClasses[size], className)} {...props} />
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 flex-1 content-start overflow-y-auto py-4 pr-1", className)}
      {...props}
    />
  )
}

const sheetSizeClasses = {
  sm: "data-[side=right]:sm:max-w-sm data-[side=left]:sm:max-w-sm",
  default: "data-[side=right]:sm:max-w-lg data-[side=left]:sm:max-w-lg",
  lg: "data-[side=right]:sm:max-w-2xl data-[side=left]:sm:max-w-2xl",
  xl: "data-[side=right]:sm:max-w-4xl data-[side=left]:sm:max-w-4xl",
} as const

function Sheet({ ...props }: React.ComponentProps<typeof LocalSheet>) {
  return <LocalSheet {...props} />
}

function SheetContent({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof LocalSheetContent> & {
  size?: keyof typeof sheetSizeClasses
}) {
  return <LocalSheetContent className={cn(sheetSizeClasses[size], className)} {...props} />
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("min-h-0 flex-1 content-start overflow-y-auto px-4 py-4", className)}
      {...props}
    />
  )
}

const Collapsible = withAsChild(LocalCollapsible as AsChildComponent, "Collapsible")

const CollapsibleTrigger = withAsChild(
  LocalCollapsibleTrigger as AsChildComponent,
  "CollapsibleTrigger",
)

const DropdownMenu = LocalDropdownMenu

const DropdownMenuTrigger = withAsChild(
  LocalDropdownMenuTrigger as AsChildComponent,
  "DropdownMenuTrigger",
)

const DropdownMenuItem = withAsChild(LocalDropdownMenuItem as AsChildComponent, "DropdownMenuItem")

const SidebarMenuButton = withAsChild(
  LocalSidebarMenuButton as AsChildComponent,
  "SidebarMenuButton",
)

const SidebarMenuSubButton = withAsChild(
  LocalSidebarMenuSubButton as AsChildComponent,
  "SidebarMenuSubButton",
)

export {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ConfirmActionButton,
  ContractTemplateAuthoringHelp,
  cn,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  Label,
  // Notification* + RichTextEditor are re-exported via `export *` above;
  // intentionally omitted here so they remain tree-shakeable.
  OverviewMetric,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  ScrollBar,
  Select,
  SelectContent,
  SelectItem,
  SelectionActionBar,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  Switch,
  Textarea,
  Toaster,
  useSidebar,
}
