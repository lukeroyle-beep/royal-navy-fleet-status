export class LayerTogglePanel {
  constructor({ inputs, onChange }) {
    this.inputs = inputs;
    this.onChange = onChange;
    this.state = {
      aircraft: true,
      maritime: true,
      incidents: true,
      zones: true,
    };

    this.inputs.forEach((input) => {
      this.state[input.dataset.layerToggle] = input.checked;
      input.addEventListener("change", () => {
        this.state[input.dataset.layerToggle] = input.checked;
        this.onChange(this.getState());
      });
    });
  }

  getState() {
    return { ...this.state };
  }
}

