const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const liquid = require("liquid");
const cheerio = require("cheerio");
const { core, github } = require("@actions");
const octo = require("@octokit/core");

const fs_options = { encoding: "utf-8" };

const octokit = new octo.Octokit();

// A user had sumbitted a widget PR and it has been accepted.


async function getNewWidgetFile() {
  const file = await fs.promises.readFile(path, fs_options);
  const result = cheerio.load(file);
  return result;
}

// Required
// Extract front matter
// Expected output:
// {
//   name: The name of the widget
//   summary: Brief description of the widget
// }
function getFrontMatter(file) {
  const front_matter = { name: null, summary: null };
  const yamlChunk = file.substring(0, file.indexOf("---"));
  const doc = yaml.load(yamlChunck);
  
  return { 
    name: doc.name, 
    summary: doc.summary,
    author: octokit.author,
    profile: octokit.profile,
    date: octokit.data
  };
}


// Required
// Extracts the <body>...</body> of the new widget.
function getBody(cheerio_instance) {
  const body = cheerio_instance.html("body");
}


// Extracts the <style>...</style> of the new widget.
function getStyle(cheerio_instance) {
  const style = cheerio_instance.html("style");
}


// Extracts the <script>...</script> of the new widget.
function getScript(cheerio_instance) {
  const script = cheerio_instance.html("script");
}


async function prependItemToList(item) {
  const file = await fs.promises.readFile(path, fs_options);
  const context = cheerio.load(file);
  context(".widgets").prepend(item);
  return context.html();
}

async function writeHomePage(page) {
  const result = await fs.promises.writeFile(path, page, fs_options);
  return result;
}

async function loadTemplates() {
  const item = await fs.promises.readFile("./templates/item.html", fs_options);
  const widget = await fs.promises.readFile("./templates/widget.html", fs_options);
  
  return { item, widget };
}

(async function(){
  try {
    console.log(github.context.payload);
    
    
    return
    //1. load submitted file. If it does not have the required components error out.
    const context = await getNewWidgetFile();
    const frontmatter = getFrontMatter(context);
    const body = getBody(context);
    const style = getStyle(context);
    const script = getScript(context);
    
    if (!frontmatter.valid || !body.valid) throw `The file does not contain a valid frontmatter and or body.`;
    
    // 1. load templates.
    const templates = await loadTemplates();
    const engine = new liquid.Engine();
    // 2. populate submitted widget content into widget template.
    const widget_engine = await engine.parse(templates.widget);
    const widget = widget_engine.reder(widget_content);
    // 3. save new widget to docs directory
    // 4. populate item template with widget data
    const item_engine = await engine.parse(templates.item)
    const item = item_enige.render(frontmatter);
    // 5. append item template to widget list on home page.
    const page = await prependItemToList(item);
    const writePage = await wrightHomePage(page);
    // 5. update user to contributors list on README.md, if not already listed.
    const readme = await manageReadme();
    const writeReadme = await writeReadme(readme);
    return "Success";
  } catch(error) {
    core.setFailed(error);
  }
})()
