console.log(
  JSON.stringify({
    application: { keys: ["mount"], mountType: "function" },
    aggregateModels: [{ registrationId: "plain.player", initializerType: "function" }],
    commands: [],
    progressions: [],
    components: [{ registrationId: "plain.component", implementationType: "object" }],
  }),
);
