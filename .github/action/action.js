const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const liquid = require("liquid");
const cheerio = require("cheerio");
const core = require("@actions/core");
const github = require("@actions/github");
const octo = require("@octokit/core");


const owner = "mudlabs";
const repo = "web-widgets";
const fs_options = { encoding: "utf-8" };
const octokit = github.getOctokit(core.getInput("token"));

const readFile = async (path, options = fs_options) => await fs.promises.readFile(path, options);
const writeFile = async (path, contents, options = fs_options) => await fs.promises.writeFile(path, contents, options);
const cheerify = file => cheerio.load(file);
const widgetId = (author, name) => `${author}--${name.replace(/\s+/g, "").toLowerCase()}`;
const toBoolean = (boolean_string) => boolean_string.toLowerCase() === "false" ? false : true;

// Finds the original author of a file created on the repo.
async function originalAuthor(path) {
  const commits = await octokit.request("GET /repos/{owner}/{repo}/commits", { owner, repo, path});
  const original = commits.data.pop();
  const author = original.author.login;
  const avatar = original.author.avatar_url;
  const profile = original.author.html_url;
  return { author, avatar, profile };
}

// Request widget file from commit and return its contents as a cheerio instance.
async function getWidgetFile(path) {
  const commits = github.context.payload.commits;
  const commit = await octokit.request({
          method: "GET",
          url: `https://api.github.com/repos/mudlabs/web-widgets/commits/${commits[0].id}`
        });
  const commit_file = commit.data.files[0];
  const file = await octokit.request({ method: "GET", url: commit_file.raw_url });
  const name = commit_file.filename.replace(/^widgets\//, "");
  const context = cheerio.load(file.data);
  return { name, context };
}


// Required
function getRenderData(original, cheerio_instance) {
  const validate = item => typeof item == "string" && item !== "";
  const date = new Date().toDateString();
  const name = cheerio_instance("body").data("widget-name");
  const id = widgetId(original.author, name);
  const summary = cheerio_instance("body").data("widget-summary");
  const author = original.author;
  const profile = original.profile;
  const avatar = original.avatar;
  const invalid = !(validate(name) && validate(summary));
  
  return { id, name, summary, author, avatar, profile, date, invalid };
}


// Required
// Extracts the <body>...</body> of the new widget.
function getWidget(cheerio_instance) {
  cheerio_instance("body").removeAttr("data-widget-name");
  cheerio_instance("body").removeAttr("data-widget-summary");
  return cheerio_instance.html("body");
}

async function loadTemplates() {
  const item = await readFile("./.github/action/templates/item.html");
  const widget = await readFile("./.github/action/templates/widget.html");
  const contributor = await readFile("./.github/action/templates/contributor.html");
  
  return { item, widget, contributor };
}

async function updateList(item) {
  const path = "./docs/index.html";
  const file = await readFile(path);
  const instance = cheerify(file);
  instance(".widgets").prepend(item);
  const write = await writeFile(path, instance.html());
  return write;
}

async function writeWidget(path, widget) {
  const result = await writeFile(`./docs/${path}`, widget);
  return result;
}


async function removeContributor(instance, author) {
  const hasWidgets = instance(`li[class=widget][data-author=${author}]`).length === 0 ? false : true;
  if (!hasWidgets) {
    const readme = await readFile("./README.md");
    const instance = cheerify(readme);
    instance(`td[id=${author}]`).remove();
    const result = await writeFile("./README.md", instance.xml());
    return result;
  }
  return;
}

async function addContributor(template, engine, data) {
  let changed = false;
  const readme = await readFile("./README.md");
  const instance = cheerify(readme);
  const contributors = instance("#contributors");
  if (contributors.has(`#${data.author}`).length === 0) {
    const readme_engine = await engine.parse(template);
    const td = await readme_engine.render(data);
    const last_tr = contributors.children("tr").last();
    last_tr.children("td").length > 6
      ? contributors.append(`<tr>${td}</tr>`)
      : last_tr.append(td);
    const result = await writeFile("./README.md", instance.xml());
    return result;
  }
  return;
}

// Runs if a commit has deleted a widget.
async function removedWidget(data, file) {
  const list = await readFile("docs/index.html");
  const instance = cheerify(list);
  const widgets = instance(".widgets");
  const item = widgets.children(`#${data.id}`);
  if (item.length === 1) {
    instance(item).remove();
    const rm = await fs.promises.unlink(`docs/${file}`);
    const done = await writeFile("docs/index.html", instance.html())
    return instance;
  } else {
    throw Error(`
      Could not remove widget (${data.name}). Expected child count 1, found ${item.length}.
        -  ID: ${data.id}
    `);
  }
}

(async function(){
  try {
    const added = toBoolean(core.getInput("added"));
    const removed = toBoolean(core.getInput("deleted"));
    const modified = toBoolean(core.getInput("modified"));
    const renamed = toBoolean(core.getInput("renamed"));
    const name = core.getInput("name");
    const previous = core.getInput("previous");
    
    const file = await getWidgetFile(name);
    const original = await originalAuthor(name);
    const data = getRenderData(original, file.context);
    const templates = await loadTemplates();
    const engine = new liquid.Engine();
    
    if (removed) {
      const done = await removedWidget(data, file.name);
      const result = await removeContributor(done, data.author)
      return result;
    }
    
    if (data.invalid) throw `There is a problem with the widgets required data attributes. Please check the documentation.`;
    
    data["widget"] = getWidget(file.context);
    data["path"] = file.name;
    
    console.log(data);
    console.log(templates.widget)
    const widget_engine = await engine.parse(templates.widget);
    const widget = await widget_engine.render(data);
    console.log(widget)
    const page = await writeWidget(file.name, widget);
    
    const item_engine = await engine.parse(templates.item)
    const item = await item_engine.render(data);
    console.log(item);
    const list = await updateList(item)
    
    if (added) await addContributor(templates.contributor, engine, data);
    return "Success";
  } catch(error) {
    core.setFailed(error);
  }
})()
