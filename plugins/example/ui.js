window.TrainerStudio.registerPlugin({
  id: "example",
  mount(element) {
    element.textContent = "Example";
  },
  commands: [
    {
      id: "example.run",
      title: "Run example",
      run() {
        fetch("/api/plugins/ext/example/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: "example.run" }),
        });
      },
    },
  ],
});
