const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const port = 3000;

// Date to filter articles (January 1st, 2022)
const filterDate = new Date('2022-01-01');

// Function to scrape an individual article page
const scrapeArticle = async (url, visitedUrls) => {
  if (visitedUrls.has(url)) {
    return null; // Skip if article has already been scraped
  }

  try {
    visitedUrls.add(url); // Mark this article as visited
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    
    // Extract article headline and publication date (adjust selectors as needed)
    const headline = $('h1').text().trim(); // Main headline of the article
    const dateStr = $('time').attr('datetime') || $('time').text().trim(); // Publication date (handle both cases)
    
    // If there is no headline or date, skip this article
    if (!headline || !dateStr) {
      return null;
    }

    // Parse the date string into a Date object
    const articleDate = new Date(dateStr);
    
    // Compare the article's date to the filter date
    if (articleDate >= filterDate) {
      return { headline, date: articleDate.toISOString(), url };
    } else {
      return null; // Skip article if it's before January 1st, 2022
    }
  } catch (error) {
    return null;
  }
};

// Function to scrape a page for article links (homepage or pagination page)
const scrapePage = async (url) => {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    // Extract article links (adjust selectors based on actual structure)
    const articleLinks = [];
    $('a[href^="/202"]').each((i, element) => {  // Assuming articles start with "/202" in the URL
      const articleUrl = 'https://www.theverge.com' + $(element).attr('href'); // Full URL
      articleLinks.push(articleUrl);
    });

    // Look for the "More Stories" button (on the landing page)
    const moreStoriesButton = $('span._1b2cyqa6._1b2cyqa4').parent().attr('href');
    if (moreStoriesButton) {
      const moreStoriesUrl = 'https://www.theverge.com' + moreStoriesButton;
      return { articleLinks, nextPageUrl: moreStoriesUrl };  // Return "More Stories" link as next page for the landing page
    }

    // Look for the "Next" button (on the rest of the pages)
    const nextPageLink = $('span.mxmugz5.mxmugz3')
      .filter((i, element) => $(element).text().trim() === 'Next') // Filter for the "Next" button
      .parent().attr('href');
    const nextPageUrl = nextPageLink ? 'https://www.theverge.com' + nextPageLink : null;
    
    return { articleLinks, nextPageUrl };
  } catch (error) {
    return { articleLinks: [], nextPageUrl: null };
  }
};

// Function to scrape all articles across pages
const scrapeAllArticles = async (startUrl) => {
  let articles = [];
  let pagesToVisit = [startUrl];
  let visitedPages = new Set();
  let visitedUrls = new Set();

  while (pagesToVisit.length > 0) {
    const currentUrl = pagesToVisit.pop();
    if (visitedPages.has(currentUrl)) continue;
    visitedPages.add(currentUrl);

    console.log(`Scraping page: ${currentUrl}`);
    const { articleLinks, nextPageUrl } = await scrapePage(currentUrl);

    // Use Promise.all to scrape articles concurrently
    const articlePromises = articleLinks.map(articleUrl =>
      scrapeArticle(articleUrl, visitedUrls)
    );

    const scrapedArticles = await Promise.all(articlePromises);

    // Add non-null articles to the final list
    scrapedArticles.forEach((article) => {
      if (article) {
        articles.push(article);
      }
    });

    if (nextPageUrl && !visitedPages.has(nextPageUrl)) {
      pagesToVisit.push(nextPageUrl);
    }
  }

  // Remove duplicates and sort the articles
  const uniqueSortedArticles = removeDuplicatesAndSort(articles);

  return uniqueSortedArticles;
};

// Serve the HTML page with scraped articles
app.get('/', async (req, res) => {
  const articles = await scrapeAllArticles('https://www.theverge.com/');

  let articleListHtml = '';
  articles.forEach(article => {
    const date = new Date(article.date).toLocaleDateString();
    articleListHtml += `
      <li class="article-item">
        <a href="${article.url}" target="_blank">${article.headline}</a>
        <br>
        <time datetime="${article.date}">Published on: ${date}</time>
      </li>
    `;
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Article Headlines</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #fff;
          color: #000;
          margin: 0;
          padding: 20px;
        }

        h1 {
          text-align: center;
          margin-bottom: 40px;
          font-size: 2em;
        }

        .article-list {
          list-style-type: none;
          padding: 0;
        }

        .article-item {
          margin-bottom: 20px;
          font-size: 1.2em;
        }

        .article-item a {
          color: #000;
          text-decoration: none;
        }

        .article-item a:hover {
          text-decoration: underline;
        }

        .article-item time {
          font-size: 0.9em;
          color: gray;
        }
      </style>
    </head>
    <body>

      <h1>Article Headlines</h1>
      
      <ul class="article-list">
        ${articleListHtml}
      </ul>

    </body>
    </html>
  `;
  
  res.send(htmlContent);
});

const removeDuplicatesAndSort = (articles) => {
    // Remove duplicates by title (case-sensitive)
    const uniqueArticles = articles.filter((value, index, self) => 
      index === self.findIndex((t) => (
        t.headline === value.headline
      ))
    );
  
    // Sort the articles by date in descending order (latest first)
    uniqueArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
  
    return uniqueArticles;
  };
  

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
