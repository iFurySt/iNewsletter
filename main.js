const Parser = require("rss-parser");

module.exports =async ({github, context}) => {
    const { data: issues } = await github.rest.issues.listForRepo({
        owner: context.repo.owner,
        repo: context.repo.repo,
        state: 'open',
    });

    console.log(issues);

    const validIssues = issues.map(issue => {
        try {
            const body = issue.body;
            const labelMatch = body.match(/### Source Type\n\n(.*)\n/);
            const urlMatch = body.match(/### Source Url\n\n(.*)\n/);
            const emailMatch = body.match(/### Email\n\n(.*)(\n)?/);

            return {
                label: labelMatch ? labelMatch[1] : null,
                url: urlMatch ? urlMatch[1] : null,
                email: emailMatch ? emailMatch[1] : null,
                number: issue.number,
            };
        } catch (error) {
            console.error(`Failed to process issue ${issue.number}: ${error.message}`);
            return null;
        }
    }).filter(info => info !== null && info.label !== null && info.url !== null && info.email !== null);

    let parser = new Parser();

    for (const issue of validIssues) {
        let markdownString = '';
        try {
            let feed = await parser.parseURL(issue.url);
            feed.items.forEach(item => {
                console.log(item.title + ':' + item.link + item.pubDate);
                markdownString += `- [${item.title}](${item.link}) - ${item.pubDate}\n`;
            });
        } catch (error) {
            console.error(`Failed to process issue ${issue.number}: ${error.message}`);
        }
        await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issue.number,
            body: `Validated source: ${issue.label} - ${issue.url} - ${issue.email}\n\n${markdownString}`,
        });
    }
}