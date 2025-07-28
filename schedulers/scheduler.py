import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from utils.audience_selector import refresh_audience_embeddings
import asyncio
import concurrent.futures

logger = logging.getLogger(__name__)

class AudienceEmbeddingScheduler:
    """Scheduler for refreshing audience embeddings"""
    
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._setup_jobs()
    
    def _setup_jobs(self):
        """Setup scheduled jobs"""
        # Add scheduled job for audience embedding refresh
        self.scheduler.add_job(
            self._scheduled_refresh_audience_embeddings,
            CronTrigger(day_of_week='sun', hour=6, minute=0),  # Every Sunday at 6:00 AM
            id='refresh_audience_embeddings',
            name='Refresh Audience Embeddings Weekly',
            replace_existing=True
        )
        logger.info("Scheduled jobs configured")
    
    async def _scheduled_refresh_audience_embeddings(self):
        """Scheduled job to refresh audience embeddings"""
        try:
            logger.info("Starting scheduled audience embedding refresh...")
            
            # Run in background thread to avoid blocking
            loop = asyncio.get_event_loop()
            with concurrent.futures.ThreadPoolExecutor() as executor:
                await loop.run_in_executor(executor, refresh_audience_embeddings)
            
            logger.info("Scheduled audience embedding refresh completed successfully")
        except Exception as e:
            logger.error(f"Error in scheduled audience embedding refresh: {e}")
    
    def start(self):
        """Start the scheduler"""
        try:
            self.scheduler.start()
            logger.info("Scheduler started successfully")
            logger.info("Audience embedding refresh scheduled for every Sunday at 6:00 AM")
        except Exception as e:
            logger.error(f"Error starting scheduler: {e}")
    
    def stop(self):
        """Stop the scheduler"""
        try:
            self.scheduler.shutdown()
            logger.info("Scheduler stopped successfully")
        except Exception as e:
            logger.error(f"Error stopping scheduler: {e}")
    
    def get_status(self):
        """Get scheduler status and job information"""
        try:
            jobs = []
            for job in self.scheduler.get_jobs():
                jobs.append({
                    "id": job.id,
                    "name": job.name,
                    "next_run_time": str(job.next_run_time),
                    "trigger": str(job.trigger)
                })
            
            return {
                "scheduler_running": self.scheduler.running,
                "jobs": jobs
            }
        except Exception as e:
            logger.error(f"Error getting scheduler status: {e}")
            return {"error": str(e)}
    
    async def trigger_refresh(self):
        """Manually trigger the audience embedding refresh"""
        try:
            logger.info("Manually triggering audience embedding refresh...")
            
            # Run in background thread to avoid blocking
            loop = asyncio.get_event_loop()
            with concurrent.futures.ThreadPoolExecutor() as executor:
                await loop.run_in_executor(executor, refresh_audience_embeddings)
            
            return {"message": "Manual audience embedding refresh completed successfully"}
        except Exception as e:
            logger.error(f"Error in manual audience embedding refresh: {e}")
            raise e

# Global scheduler instance
scheduler = AudienceEmbeddingScheduler()