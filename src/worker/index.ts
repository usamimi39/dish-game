export default {
	async fetch() {
		return new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
