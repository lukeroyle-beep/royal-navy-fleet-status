export class MapStartupViewGate {
  #phase = "pending";

  get ready() {
    return this.#phase === "ready";
  }

  runAutomaticFit(callback) {
    if (!this.ready) return false;
    callback();
    return true;
  }

  complete(callback) {
    if (this.#phase !== "pending") {
      throw new Error("The startup map view has already been completed.");
    }
    this.#phase = "applying";
    try {
      callback();
      this.#phase = "ready";
    } catch (error) {
      this.#phase = "pending";
      throw error;
    }
  }
}
