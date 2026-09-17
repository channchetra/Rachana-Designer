/**
 * Radix icon compatibility shim.
 *
 * The original `LayoutPanel` imported 29 icons from `@radix-ui/react-icons`.
 * Rather than rewrite 29 call sites inside a 750-line component — and risk
 * changing behaviour while doing it — this module re-exports the same names
 * backed by `lucide-react`, which the rest of the app already uses.
 *
 * Benefits:
 *  - `LayoutPanel`'s body stays byte-identical to the original,
 *  - one icon family across the whole UI (design.md §53 requires exactly that),
 *  - one fewer runtime dependency.
 *
 * Each mapping is chosen for equivalent meaning and orientation, not just a
 * matching name:
 *  - Radix `AlignLeftIcon` is a *vertical* bar with items to its right, i.e. a
 *    left-aligned block. Lucide's `AlignStartVertical` carries the same meaning.
 *  - Radix `ColumnsIcon` is a multi-column glyph → Lucide `Columns3`.
 *  - Radix `MixIcon` (a blend metaphor) → Lucide `Blend`.
 *  - Radix `DashIcon` (an "auto/unset" dash) → Lucide `Minus`.
 */

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Blend,
  Box,
  ChevronRight,
  Columns3,
  EyeOff,
  Grid3x3,
  Link2,
  Link2Off,
  Minus,
  MoveHorizontal,
  MoveVertical,
  Square,
  StretchHorizontal,
  StretchVertical,
  Type,
  Underline,
  Unlink,
} from "lucide-react";

/** Radix name → the Lucide component that carries the same meaning. */
export {
  ChevronRight as ChevronRightIcon,
  Link2 as Link2Icon,
  Unlink as LinkBreak2Icon,
  Square as SquareIcon,
  Columns3 as ColumnsIcon,
  Grid3x3 as GridIcon,
  Box as BoxIcon,
  Blend as MixIcon,
  Type as TextIcon,
  EyeOff as EyeNoneIcon,
  ArrowRight as ArrowRightIcon,
  ArrowDown as ArrowDownIcon,
  ArrowLeft as ArrowLeftIcon,
  ArrowUp as ArrowUpIcon,
  AlignStartVertical as AlignLeftIcon,
  AlignEndVertical as AlignRightIcon,
  AlignCenterVertical as AlignCenterHorizontallyIcon,
  AlignStartHorizontal as AlignTopIcon,
  AlignEndHorizontal as AlignBottomIcon,
  AlignCenterHorizontal as AlignCenterVerticallyIcon,
  AlignHorizontalSpaceBetween as SpaceBetweenHorizontallyIcon,
  AlignVerticalSpaceBetween as SpaceBetweenVerticallyIcon,
  MoveHorizontal as SpaceEvenlyHorizontallyIcon,
  MoveVertical as SpaceEvenlyVerticallyIcon,
  StretchHorizontal as StretchHorizontallyIcon,
  StretchVertical as StretchVerticallyIcon,
  Underline as UnderlineIcon,
  Minus as DashIcon,
};
