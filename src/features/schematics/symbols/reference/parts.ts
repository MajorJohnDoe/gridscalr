/** Inline ports on the left and right symbol edges, without connection stubs. */
export const PORTS_INLINE = () => [
  { id: "in", x: 2, y: 32, direction: "in" as const },
  { id: "out", x: 62, y: 32, direction: "out" as const },
];
