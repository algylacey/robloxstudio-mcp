import State from "../modules/State";
import UI from "../modules/UI";
import Communication from "../modules/Communication";


UI.init(plugin);
const elements = UI.getElements();


const toolbar = plugin.CreateToolbar("MCP Integration");
const button = toolbar.CreateButton("MCP Server", "Connect to MCP Server for AI Integration", "rbxassetid://10734944444");


elements.connectButton.Activated.Connect(() => {
	const conn = State.getActiveConnection();
	if (conn && conn.isActive) {
		Communication.deactivatePlugin(State.getActiveTabIndex());
	} else {
		Communication.activatePlugin(State.getActiveTabIndex());
	}
});


button.Click.Connect(() => {
	elements.screenGui.Enabled = !elements.screenGui.Enabled;
});


plugin.Unloading.Connect(() => {
	Communication.deactivateAll();
});


UI.updateUIState();
Communication.checkForUpdates();

// Auto-connect on plugin load — activatePlugin starts a persistent heartbeat
// polling loop that retries with backoff, so a single call is sufficient.
// The plugin will keep attempting to discover and connect to an MCP server
// until one becomes available (polls every ~1s, backing off on repeated failures).
Communication.activatePlugin(0);
