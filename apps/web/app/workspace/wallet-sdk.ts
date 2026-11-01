// Lazy loading keeps wallet code out of server rendering.
export async function loadConnector() {
  const { MeteorConnect } = await import("@meteorwallet/sdk");
  return new MeteorConnect();
}
