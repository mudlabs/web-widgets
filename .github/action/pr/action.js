const cheerio = require("cheerio");
const core = require("@actions/core");
const github = require("@actions/github");

const octokit = github.getOctokit(core.getInput("token"));

(async function(){
  try {
    const commits = github.context.payload.pull_request.commits;
    console.log(commits);
    const commit = await octokit.request({ method: "GET", url: `https://api.github.com/repos/mudlabs/web-widgets/commits/${commits[0].id}`});
    console.log(commit.data);
    const item = commit.data.files[0];
    const file = await octokit.request({ method: "GET", url: item.raw_url });
    const context = cheerio.load(file.data);
    
    const validate = (tag, val) => {
      const value = tag.attr(`data-widget-${val}`);
      return typeof value == "string" && value.trim() !== "";
    };

    const body = $("body");
    const name = $("body[data-widget-name]");
    const summary = $("body[data-widget-summary]");
    const has_items = Boolean(body.length && name.length && summary.length);
    
    if (!has_items) throw Error("Your widget is missing required markup.");
    
    const valid_name = validate(name, "name");
    const valid_summary = validate(summary, "summary");
    const valid = valid_name && valid_summary;
    
    if (!valid) throw Error("Your widgets name or summary attributes are invalid.");
    
    core.setSuccess("Widget can be merged.");
  } catch(error){
    core.setFailed(error);
  }
})();
