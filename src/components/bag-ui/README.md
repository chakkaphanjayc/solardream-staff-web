# SolarDream BagUI layer

SolarDream uses BagUI as a local registry source rather than as a runtime npm
package. The shared primitives in `src/components/ui` follow the structure and
interaction patterns from the upstream registry, then adapt them to the
SolarDream tokens, bilingual content, and existing route behavior.

The local layer is built on the requested stack: Tailwind CSS v4 for tokens
and layout, shadcn/ui conventions with Radix Slot and
class-variance-authority for composable primitives, and Framer Motion for
reduced-motion-aware reveal transitions.

Upstream registry: https://github.com/anelkabag/bag-ui

The project keeps the copied layer local so components can remain typed,
accessible, and independently versioned with the product instead of shipping
an unrelated demo application or importing a second styling runtime.
