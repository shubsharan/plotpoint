console.log(
  JSON.stringify({
    application: { keys: ["mount"], mountType: "function" },
    aggregateModels: [{ registrationId: "plain.player", initializerType: "object" }],
    commands: [],
    progressions: [],
    components: [{ registrationId: "plain.component", implementationType: "function" }],
  }),
);
