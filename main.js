const Parser = require("rss-parser");

module.exports =async ({github, context}) => {
    const { data: issues } = await github.rest.issues.listForRepo({
        owner: context.repo.owner,
        repo: context.repo.repo,
        state: 'open',
    });

    const validIssues = issues.map(issue => {
        try {
            const body = issue.body;
            const labelMatch = body.match(/### Source Type\n\n(.*)\n/);
            const urlMatch = body.match(/### Source Url\n\n(.*)(\n)?/);

            if (!labelMatch || !urlMatch || !urlMatch[1] || !labelMatch[1]) {
                throw new Error('Invalid issue format');
            }

            return {
                label: labelMatch[1],
                url: urlMatch[1],
                number: issue.number,
            };
        } catch (error) {
            console.error(`Failed to process issue ${issue.number}: ${error.message}`);
            (async () => {
                await github.rest.issues.createComment({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    issue_number: issue.number,
                    body: 'Failed to parse, going to close this issue.',
                });

                await github.rest.issues.update({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    issue_number: issue.number,
                    state: 'closed',
                });
            })();
            return null;
        }
    }).filter(info => info !== null && info.label !== null && info.url !== null);

    let parser = new Parser();

    for (const issue of validIssues) {
        const { data: comments } = await github.rest.issues.listCommentsForRepo({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issue.number,
        });

        const published = {}
        comments.forEach(item => {
            const matches = item.body.match(/- \[(.*)\]\((.*)\)/g);
            if (!matches) return;
            matches.forEach(match => {
                const titleMatch = match.match(/- \[(.*)\]\((.*)\)/);
                if (titleMatch && titleMatch.length === 3) {
                    published[titleMatch[2]] = titleMatch[1];
                }
            });
        })

        let markdownString = '';
        try {
            let feed = await parser.parseURL(issue.url);
            feed.items.forEach(item => {
                if (published[item.link]) {
                    console.log('Already published: ' + item.title + ':' + item.link + item.pubDate);
                    return;
                }
                markdownString += `- [${item.title}](${item.link}) - ${item.pubDate}\n\`\`\`\n${item.contentSnippet}\n\`\`\`\n\n`;
            });
        } catch (error) {
            console.error(`Failed to process issue ${issue.number}: ${error.message}`);
        }

        if (markdownString === '') {
            console.error(`No new items found for issue ${issue.number}`);
            return
        }

        await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: issue.number,
            body: markdownString,
        });
    }
}